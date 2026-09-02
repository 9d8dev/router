import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { CircleAlert, ArrowUp } from "lucide-react";
import { Badge } from "../ui/badge";

export const Usage = ({
  totalUsage,
  used,
  plan,
}: {
  totalUsage: number;
  used: number;
  plan: string;
}) => {
  const calculateDaysLeft = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const timeDiff = nextMonth.getTime() - now.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  };

  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const daysLeft = calculateDaysLeft();
  const remaining = Math.max(0, totalUsage - used);
  const usagePercentage = totalUsage > 0 ? (used / totalUsage) * 100 : 100;

  return (
    <Card className="w-full flex flex-col">
      <CardHeader className="mb-6 border-b">
        <CardTitle>Usage Overview</CardTitle>
        <CardDescription>Monitor your usage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 flex-grow">
        <div className="grid gap-3 p-3 border rounded-sm bg-muted/25">
          <div className="flex justify-between items-center">
            <p>
              {formatNumber(used)} / {formatNumber(totalUsage)}{" "}
              <span className="text-muted-foreground text-xs">
                Leads Captured
              </span>
            </p>
            <Badge variant={plan === "Free" ? "outline" : "default"}>
              {plan}
            </Badge>
          </div>
          <Progress value={Math.min(100, usagePercentage)} className="h-2" />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {used >= totalUsage
                ? `Grace capacity: ${formatNumber(Math.max(0, Math.round(totalUsage * 1.1) - used))} leads remaining`
                : `${formatNumber(remaining)} leads remaining`}
            </p>
            <p className="flex items-center space-x-1 text-xs">
              <CircleAlert className="h-3 w-3 text-green-500" />
              <span>
                Plan resets in <span className="font-medium">{daysLeft}</span>{" "}
                day{daysLeft !== 1 ? "s" : ""}
              </span>
            </p>
          </div>
        </div>
      </CardContent>
      {(plan === "free" || plan === "lite") && (
        <CardFooter className="mt-auto">
          <UpgradePlan />
        </CardFooter>
      )}
    </Card>
  );
};

const UpgradePlan = () => {
  return (
    <Link
      href="/upgrade"
      target="_blank"
      rel="noopener noreferrer"
      className="p-4 hover:pl-5 hover:pr-3 transition-all h-full w-full border grid gap-1 border-green-500 rounded-sm bg-green-500/15 hover:bg-green-500/25"
    >
      <span className="flex items-center gap-1">
        Upgrade Plan
        <ArrowUp className="h-4 w-4" />
      </span>
      <span className="text-muted-foreground text-xs">
        Upgrade your plan to capture more leads
      </span>
    </Link>
  );
};
