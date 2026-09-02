import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  endpoints,
  forms,
  formPlacementMilestones,
  leads,
  logs,
  usagePeriods,
  users,
} from "@/lib/db/schema";
import { captureServerEvent } from "@/lib/analytics/server";
import { formDefinitionV1Schema, validateFormValues } from "./definition";
import { validateEndpointValues } from "./endpoint-schema";
import {
  getCapacityState,
  getEntitlement,
  type CapacityState,
  type RouterPlan,
} from "./entitlements";
import type { FormPlacement } from "./submission-token";
import {
  crossedUsageThresholds,
  deliverUsageThresholdNotification,
  type UsageThreshold,
} from "./usage-notifications";

export class LeadValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super("The submitted values are invalid.");
    this.name = "LeadValidationError";
  }
}

export class LeadCapacityError extends Error {
  constructor(readonly capacity: CapacityState) {
    super("Monthly lead capacity has been reached.");
    this.name = "LeadCapacityError";
  }
}

export class LeadEndpointError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 = 404
  ) {
    super(message);
    this.name = "LeadEndpointError";
  }
}

type HeadlessAcceptanceInput = {
  endpointId: string;
  values: unknown;
  placement: "headless" | "legacy_html";
};

type PublicFormAcceptanceInput = {
  publicId: string;
  values: unknown;
  placement: FormPlacement;
};

export type AcceptLeadInput = HeadlessAcceptanceInput | PublicFormAcceptanceInput;

type AcceptanceResult = {
  leadId: string;
  completion?:
    | { type: "message"; message: string }
    | { type: "redirect"; url: string };
  capacity: CapacityState;
};

function utcPeriodStart(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function deliverWebhook(input: {
  endpointId: string;
  url: string;
  values: Record<string, unknown>;
}): Promise<void> {
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.values),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 2_000) || `HTTP ${response.status}`;
      await db.insert(logs).values({
        endpointId: input.endpointId,
        type: "error",
        postType: "webhook",
        message: { error: message },
        createdAt: new Date(),
      });
      return;
    }
    await db.insert(logs).values({
      endpointId: input.endpointId,
      type: "success",
      postType: "webhook",
      message: { success: true, url: input.url },
      createdAt: new Date(),
    });
  } catch (error) {
    await db.insert(logs).values({
      endpointId: input.endpointId,
      type: "error",
      postType: "webhook",
      message: {
        error: error instanceof Error ? error.message.slice(0, 2_000) : "Webhook failed.",
      },
      createdAt: new Date(),
    });
  }
}

async function logRejectedLead(
  input: AcceptLeadInput,
  error: unknown,
  now: Date
): Promise<void> {
  try {
    let endpointId: string | undefined;
    if ("endpointId" in input) {
      endpointId = input.endpointId;
    } else {
      const [row] = await db
        .select({ endpointId: forms.endpointId })
        .from(forms)
        .where(eq(forms.publicId, input.publicId))
        .limit(1);
      endpointId = row?.endpointId;
    }
    if (!endpointId) return;
    await db.insert(logs).values({
      endpointId,
      type: "error",
      postType: "publicId" in input ? "form" : "http",
      message: {
        error:
          error instanceof LeadValidationError
            ? "validation_failed"
            : error instanceof LeadCapacityError
              ? "monthly_capacity_reached"
              : error instanceof Error
                ? error.name
                : "unknown_error",
        ...(error instanceof LeadValidationError
          ? { fields: Object.keys(error.fieldErrors) }
          : {}),
      },
      createdAt: now,
    });
  } catch (loggingError) {
    console.error("Could not record rejected lead attempt:", loggingError);
  }
}

export async function acceptLead(
  input: AcceptLeadInput,
  now = new Date()
): Promise<AcceptanceResult> {
  try {
    const accepted = await db.transaction(async (tx) => {
    const publicSubmission = "publicId" in input;
    const [row] = publicSubmission
      ? await tx
          .select({
            endpoint: endpoints,
            owner: users,
            form: forms,
          })
          .from(forms)
          .innerJoin(endpoints, eq(forms.endpointId, endpoints.id))
          .innerJoin(users, eq(forms.userId, users.id))
          .where(
            and(
              eq(forms.publicId, input.publicId),
              isNotNull(forms.publishedAt)
            )
          )
          .limit(1)
      : await tx
          .select({ endpoint: endpoints, owner: users })
          .from(endpoints)
          .innerJoin(users, eq(endpoints.userId, users.id))
          .where(eq(endpoints.id, input.endpointId))
          .limit(1);

    if (!row) throw new LeadEndpointError(publicSubmission ? "Form not found." : "Endpoint not found.");
    if (!row.endpoint.enabled) throw new LeadEndpointError("Endpoint is disabled.", 403);

    let parsedValues: Record<string, unknown>;
    let formId: string | null = null;
    let formRevision: number | null = null;
    let completion: AcceptanceResult["completion"];

    if (publicSubmission) {
      const publicRow = row as typeof row & { form: typeof forms.$inferSelect };
      if (!publicRow.form.publishedDefinition) throw new LeadEndpointError("Form is not published.", 404);
      const definition = formDefinitionV1Schema.parse(publicRow.form.publishedDefinition);
      const validation = validateFormValues(definition, input.values);
      if (!validation.success) throw new LeadValidationError(validation.errors);
      parsedValues = validation.data;
      formId = publicRow.form.id;
      formRevision = publicRow.form.publishedRevision;
      completion = definition.completion;
    } else {
      const validation = validateEndpointValues(row.endpoint.schema, input.values);
      if (!validation.success) throw new LeadValidationError(validation.errors);
      parsedValues = validation.data;
    }

    const plan = row.owner.plan as RouterPlan;
    const entitlement = getEntitlement(plan);
    const periodStart = utcPeriodStart(now);
    const [usage] = await tx
      .insert(usagePeriods)
      .values({ userId: row.owner.id, periodStart, leadCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [usagePeriods.userId, usagePeriods.periodStart],
        set: {
          leadCount: sql`${usagePeriods.leadCount} + 1`,
          updatedAt: now,
        },
      })
      .returning({
        leadCount: usagePeriods.leadCount,
        notifiedAt80: usagePeriods.notifiedAt80,
        notifiedAt100: usagePeriods.notifiedAt100,
      });

    const graceLimit =
      entitlement.monthlyLeads === null
        ? null
        : Math.round(entitlement.monthlyLeads * 1.1);
    if (graceLimit !== null && usage.leadCount > graceLimit) {
      throw new LeadCapacityError(
        getCapacityState(plan, usage.leadCount - 1)
      );
    }

    const usageNotifications: UsageThreshold[] = crossedUsageThresholds({
      used: usage.leadCount,
      limit: entitlement.monthlyLeads,
    }).filter((threshold) =>
      threshold === 80 ? usage.notifiedAt80 === null : usage.notifiedAt100 === null
    );
    for (const threshold of usageNotifications) {
      const notificationLimitColumn =
        threshold === 80
          ? usagePeriods.notificationLimit80
          : usagePeriods.notificationLimit100;
      await tx
        .update(usagePeriods)
        .set(
          threshold === 80
            ? { notificationLimit80: entitlement.monthlyLeads }
            : { notificationLimit100: entitlement.monthlyLeads }
        )
        .where(
          and(
            eq(usagePeriods.userId, row.owner.id),
            eq(usagePeriods.periodStart, periodStart),
            isNull(notificationLimitColumn)
          )
        );
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        endpointId: row.endpoint.id,
        formId,
        formRevision,
        placement: input.placement,
        data: parsedValues,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: leads.id });

    await tx
      .update(users)
      .set({ leadCount: sql`${users.leadCount} + 1` })
      .where(eq(users.id, row.owner.id));

    await tx.insert(logs).values({
      endpointId: row.endpoint.id,
      type: "success",
      postType: publicSubmission ? "form" : "http",
      message: { success: true, id: lead.id },
      createdAt: now,
    });

    const [firstPlacement] = formId
      ? await tx
          .insert(formPlacementMilestones)
          .values({
            formId,
            placement: input.placement,
            firstLeadId: lead.id,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ formId: formPlacementMilestones.formId })
      : [];

    return {
      leadId: lead.id,
      completion,
      capacity: getCapacityState(plan, usage.leadCount),
      ownerId: row.owner.id,
      ownerEmail: row.owner.email,
      formId,
      firstPlacement: Boolean(firstPlacement),
      periodStart,
      usageNotifications,
      webhook:
        row.endpoint.webhookEnabled && row.endpoint.webhook
          ? { endpointId: row.endpoint.id, url: row.endpoint.webhook, values: parsedValues }
          : null,
    };
    });

    if (accepted.webhook) await deliverWebhook(accepted.webhook);
    if (accepted.formId && accepted.firstPlacement) {
      await captureServerEvent({
        event: "form_first_lead_by_placement",
        distinctId: accepted.ownerId,
        properties: {
          form_id: accepted.formId,
          placement: input.placement,
        },
      });
    }
    for (const threshold of accepted.usageNotifications) {
      try {
        await deliverUsageThresholdNotification({
          userId: accepted.ownerId,
          email: accepted.ownerEmail,
          threshold,
          periodStart: accepted.periodStart,
          now,
        });
      } catch (error) {
        console.error(`Could not send ${threshold}% usage notification:`, error);
      }
    }
    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/logs");

    return {
      leadId: accepted.leadId,
      completion: accepted.completion,
      capacity: accepted.capacity,
    };
  } catch (error) {
    await logRejectedLead(input, error, now);
    throw error;
  }
}
