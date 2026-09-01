// Component Imports
import AccountWidget from "../auth/widget";
import Link from "next/link";
import Image from "next/image";
import { ModeToggle } from "@/components/parts/mode-toggle";
import { getUsageForUser } from "@/lib/data/users";
import { LucideProps } from "lucide-react";
import { formsNavigationEnabled } from "@/lib/forms/feature-flags";

// Image Imports
import Logo from "@/public/logo.svg";

// Icon Imports
import {
  BarChart,
  Contact,
  Layers,
  LifeBuoy,
  Disc3,
  Book,
  FileText,
} from "lucide-react";

const links = [
  { href: "/", text: "Dashboard", icon: BarChart },
  { href: "/endpoints", text: "Endpoints", icon: Layers },
  ...(formsNavigationEnabled()
    ? [{ href: "/forms", text: "Forms", icon: FileText }]
    : []),
  { href: "/leads", text: "Leads", icon: Contact },
  { href: "/logs", text: "Logs", icon: Disc3 },
];

const otherLinks = [
  { href: "https://router.so/docs", text: "Documentation", icon: Book },
  { href: "/support", text: "Support", icon: LifeBuoy },
];

export default async function Nav() {
  const usage = await getUsageForUser();
  const plan = usage?.data?.plan;

  return (
    <nav className="p-4 flex flex-col gap-4 justify-between h-screen">
      <Link
        href="/"
        className="border bg-muted/50 flex items-center gap-2 rounded-lg p-6"
      >
        <Image
          className="dark:invert -mt-px mb-px"
          src={Logo}
          width={100}
          height={18.53}
          alt="Router.so Wordmark"
        />
      </Link>
      <div className="border bg-muted/50 rounded-lg flex flex-col justify-between p-6 h-full">
        <div className="flex flex-col gap-8">
          <div className="grid gap-2">
            {links.map((link) => (
              <NavLink key={link.href} icon={link.icon} href={link.href}>
                {link.text}
              </NavLink>
            ))}
            {otherLinks.map((link) => (
              <NavLink key={link.href} icon={link.icon} href={link.href}>
                {link.text}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-8">
            <AccountWidget plan={plan} />
            <div className="flex justify-between items-center gap-2">
              <ModeToggle />
              <p className="text-xs text-muted-foreground opacity-50">
                &copy; Router.so, 2024
              </p>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  icon: React.ComponentType<LucideProps>;
  className?: string;
}

const NavLink = ({ href, children, icon: Icon, className }: NavLinkProps) => {
  return (
    <Link
      className={`flex items-center gap-2 group p-2 rounded-md -ml-2 transition-all ${className}`}
      href={href}
    >
      <Icon
        className="text-muted-foreground group-hover:text-foreground transition-all"
        size={20}
      />
      {children}
    </Link>
  );
};
