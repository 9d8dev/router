"use client";

import { Lead } from "@/lib/db";
import { Button } from "../ui/button";
import { Parser } from "@json2csv/plainjs";
import { toast } from "sonner";

type ExportCSVProps = {
  id: string;
  leads: Lead[];
  schema: {
    key: string;
    value: ValidationType;
  }[];
};

export default function ExportCSV({ id, leads, schema }: ExportCSVProps) {
  const exportToCSV = (): void => {
    try {
      const transformedLeads = leads.map((lead) => {
        const transformedLead: { [key: string]: any } = {};
        schema.forEach((col) => {
          transformedLead[col.key] = lead.data[col.key];
        });
        return transformedLead;
      });

      const parser = new Parser({
        fields: schema.map((col) => col.key),
      });
      const csvData = parser.parse(transformedLeads);
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", `router_leads_${id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV Downloaded.");
    } catch (err) {
      console.error("Error exporting to CSV:", err);
      toast.error("An error occurred.");
    }
  };

  return (
    <Button variant="outline" onClick={exportToCSV} className="mb-4">
      Export as CSV
    </Button>
  );
}
