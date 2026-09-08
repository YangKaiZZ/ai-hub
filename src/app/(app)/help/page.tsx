import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, BrainCircuit, CalendarDays, FileUp, Keyboard, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Help" };

const topics = [
  { icon: BookOpen, title: "Getting started", body: "Add your institution and courses, then create or import tasks. The dashboard ranks them by deadline, workload and importance.", href: "/courses" },
  { icon: BrainCircuit, title: "Using the AI Tutor", body: "Ask about any subject. Switch between Learning, Guided and Review modes to control how much the tutor reveals.", href: "/tutor" },
  { icon: FileUp, title: "Uploading documents", body: "PDF, DOCX, PPTX, images and text files are extracted, indexed and searchable. Ask questions and get cited answers.", href: "/resources" },
  { icon: CalendarDays, title: "Planning your week", body: "Open the Study Planner, set your availability and let AI propose a schedule. Nothing is saved until you confirm.", href: "/planner" },
  { icon: ShieldCheck, title: "Academic integrity", body: "AI Hub explains, guides and reviews — it does not complete or submit graded work for you.", href: "/settings" },
  { icon: Keyboard, title: "Keyboard shortcuts", body: "Press Ctrl/⌘ + K anywhere to search tasks, courses, resources and documents.", href: "/dashboard" },
];

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Help" description="Short guides to get the most out of AI Hub." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map(({ icon: Icon, title, body, href }) => (
          <Link key={title} href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card interactive className="h-full">
              <CardHeader>
                <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-brand-600 dark:text-brand-300">
                  <Icon className="size-5" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
