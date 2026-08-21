"use client";

import * as React from "react";

// type imports
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useFieldArray, useForm } from "react-hook-form";
import { updateEndpointFormSchema as formSchema } from "@/lib/data/validations";

import { normalizedValidationOption, validationOptions } from "@/lib/validation";

// next imports
import { useRouter } from "next/navigation";

// UI Imports
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Endpoint } from "@/lib/db";

import { useAction } from "next-safe-action/hooks";
import { parseActionError } from "@/lib/data/safe-action";
import { updateEndpoint } from "@/lib/data/endpoints";

type DomainValues = z.infer<typeof formSchema>;

export default function EditForm({
  id,
  endpoint,
}: {
  id: string;
  endpoint: Endpoint;
}) {
  const { execute, isExecuting } = useAction(updateEndpoint, {
    onSuccess() {
      toast.success("Endpoint updated successfully.");
    },
    onError({ error }) {
      toast.error(parseActionError(error));
    },
  });

  const defaultValues: Partial<DomainValues> = {
    id: id,
    name: endpoint.name,
    schema: endpoint.schema,
    formEnabled: endpoint.formEnabled,
    successUrl: endpoint.successUrl ?? undefined,
    failUrl: endpoint.failUrl ?? undefined,
    webhookEnabled: endpoint.webhookEnabled,
    webhook: endpoint.webhook ?? undefined,
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    name: "schema",
    control: form.control,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => execute(values))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endpoint Name</FormLabel>
              <FormControl className="bg-secondary">
                <Input placeholder="Name your endpoint..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Schema */}
        <div className="border-y py-6 my-6 grid gap-2">
          <h3 className="text-sm font-medium">Schema</h3>
          {fields.map((field: any, index: any) => (
            <div
              className="grid grid-cols-2 items-start w-full gap-4"
              key={field.id}
            >
              <FormField
                control={form.control}
                key={field.id}
                name={`schema.${index}.key`}
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl className="w-full">
                      <div className="flex gap-2 items-center">
                        <Input
                          {...field}
                          className="w-full bg-secondary"
                          placeholder="Field name ..."
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`schema.${index}.value`}
                render={({ field }) => (
                  <FormItem className="w-full">
                    <div className="flex gap-2 items-center">
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl className="bg-secondary">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {validationOptions.map((type, index: number) => (
                            <SelectItem key={index} value={type.name}>
                              {normalizedValidationOption[type.name]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="border w-10 h-10 transition-all p-1"
                        variant="link"
                        onClick={() => remove(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}

          <Button
            onClick={() => {
              append({ key: "", value: "string" });
            }}
          >
            Add Field +
          </Button>
        </div>

        {/* Redirect Urls */}
        <div className="border-b pb-6 my-6 space-y-2">
          <FormField
            control={form.control}
            name="formEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="">Enable HTML Form Posting</FormLabel>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-readonly
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {form.watch("formEnabled") && (
            <>
              <p className="text-muted-foreground italic text-xs">
                *Redirect URLs are only used when posting a lead by HTML form
              </p>
              <FormField
                control={form.control}
                name="successUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Success Redirect URL</FormLabel>
                    <FormControl className="bg-secondary">
                      <Input
                        placeholder="Success URL..."
                        {...field}
                        disabled={!form.watch("formEnabled")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="failUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fail Redirect URL</FormLabel>
                    <FormControl className="bg-secondary">
                      <Input
                        placeholder="Fail URL..."
                        {...field}
                        disabled={!form.watch("formEnabled")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        {/* Webhook */}
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="webhookEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="">Include Webhook</FormLabel>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-readonly
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {form.watch("webhookEnabled") && (
            <FormField
              control={form.control}
              name="webhook"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Webhook</FormLabel>
                  <FormControl className="w-full">
                    <div className="flex gap-2 items-center">
                      <Input
                        {...field}
                        className="w-full bg-secondary"
                        placeholder="Webhook URL ..."
                        disabled={!form.watch("webhookEnabled")}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <Button
          type="submit"
          variant="secondary"
          className="mt-12"
          loading={isExecuting}
        >
          Update Endpoint
        </Button>
      </form>
    </Form>
  );
}
