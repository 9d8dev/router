/**
 * Generates a Shadcn form based on the provided schema and URL.
 *
 * @param schema - The schema defining the form fields.
 * @param url - The URL to submit the form data to.
 * @returns The generated Shadcn form as a string.
 */
export const generateShadcnForm = (schema: GeneralSchema[]): string => {
  const getZodType = (field: GeneralSchema) => {
    let zodType = "";
    switch (field.value) {
      case "string":
        zodType = "z.string()";
        break;
      case "number":
        zodType = "z.number()";
        break;
      case "date":
        zodType = "z.date()";
        break;
      case "boolean":
        zodType = "z.boolean()";
        break;
      case "email":
        zodType = "z.string().email()";
        break;
      case "url":
        zodType = "z.string().url()";
        break;
      case "phone":
        zodType = "z.string().regex(/^\\+?[1-9]\\d{1,14}$/)";
        break;
      case "zip_code":
        zodType = "z.string().regex(/^\\d{5}(?:[-\\s]\\d{4})?$/)";
        break;
      case "string_array":
        zodType = "z.array(z.string())";
        break;
      default:
        zodType = "z.string()";
    }

    const stringTypes: ValidationType[] = [
      "string",
      "email",
      "url",
      "phone",
      "zip_code",
    ];
    if (stringTypes.includes(field.value)) {
      const minimum = field.constraints?.minLength ?? (field.required ? 1 : 0);
      if (minimum > 0) {
        zodType += `.min(${minimum}, { message: 'This field is required' })`;
      }
      if (field.constraints?.maxLength !== undefined) {
        zodType += `.max(${field.constraints.maxLength})`;
      }
      if (field.constraints?.allowedValues) {
        zodType += `.refine((value) => ${JSON.stringify(field.constraints.allowedValues)}.includes(value), { message: 'Choose a valid option' })`;
      }
    } else if (field.value === "string_array") {
      const minimum = field.constraints?.minItems ?? (field.required ? 1 : 0);
      if (minimum > 0) {
        zodType += `.min(${minimum}, { message: 'Select at least ${minimum} options' })`;
      }
      if (field.constraints?.maxItems !== undefined) {
        zodType += `.max(${field.constraints.maxItems})`;
      }
      if (field.constraints?.allowedValues) {
        zodType += `.refine((values) => values.every((value) => ${JSON.stringify(field.constraints.allowedValues)}.includes(value)), { message: 'Choose only valid options' })`;
      }
    } else if (field.value === "boolean" && field.constraints?.mustBeTrue) {
      zodType += ".refine((value) => value, { message: 'This field is required' })";
    }

    if (field.required === false) {
      zodType += ".optional()";
    }
    return zodType;
  };

  const getFieldComponent = (field: GeneralSchema) => {
    if (field.value === "boolean") {
      return `
        <Switch
          className="flex"
          checked={field.value}
          onCheckedChange={field.onChange}
        />
      `;
    } else if (field.value === "date") {
      return `
        <Popover>
          <PopoverTrigger className="flex" asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-[280px] justify-start text-left font-normal",
                !field.value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={field.value}
              onSelect={field.onChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      `;
    } else if (field.value === "string_array") {
      const options = JSON.stringify(field.constraints?.allowedValues ?? []);
      return `
        <div className="space-y-2">
          {${options}.map((option) => {
            const selected = Array.isArray(field.value) ? field.value : [];
            return (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(event) =>
                    field.onChange(
                      event.target.checked
                        ? [...selected, option]
                        : selected.filter((value) => value !== option)
                    )
                  }
                />
                {option}
              </label>
            );
          })}
        </div>
      `;
    } else {
      return `
        <Input
          placeholder="${field.key}"
          {...field}
          type="${field.value}"
        />
      `;
    }
  };

  const hasBooleanField = schema.some((field) => field.value === "boolean");
  const hasDateField = schema.some((field) => field.value === "date");

  return `"use client";

import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
${
  hasBooleanField
    ? `
import { Switch } from "@/components/ui/switch";
`
    : ""
}
${
  hasDateField
    ? `
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
`
    : ""
}
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  ${schema.map((field) => `${field.key}: ${getZodType(field)}`).join(",\n  ")}
});

export function RouterForm() {
  const form = useForm({
    resolver: zodResolver(formSchema),
  });

  function onSubmit(data) {
    console.log(data);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        ${schema
          .map(
            (field) => `
        <FormField
          control={form.control}
          name="${field.key}"
          render={({ field }) => (
            <FormItem>
              <FormLabel>${field.key}</FormLabel>
              <FormControl>
                ${getFieldComponent(field)}
              </FormControl>
              <FormDescription>
                ${`Enter the ${field.key} for the endpoint.`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        `
          )
          .join("")}
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
`;
};
