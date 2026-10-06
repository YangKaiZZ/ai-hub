"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, GraduationCapIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { ApiClientError, apiGet, apiPatch, apiPost } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { InstitutionOption } from "@/server/institutions/service";
import { STEP_ORDER, type OnboardingStepName } from "@/server/onboarding/schemas";

interface InitialState {
  stepName: OnboardingStepName;
  firstName: string;
  lastName: string;
  timezone: string;
  institution: { id: string; name: string; defaultLms: string | null } | null;
  platform: string | null;
  courses: { id: string; name: string; code: string | null; instructor: string | null; color: string; icon: string }[];
  preferences: Record<string, unknown> | null;
  assistanceMode: "LEARNING" | "GUIDED" | "REVIEW";
}

const steps: { key: OnboardingStepName; label: string }[] = [
  { key: "profile", label: "Name" },
  { key: "institution", label: "Institution" },
  { key: "platform", label: "Platform" },
  { key: "courses", label: "Courses" },
  { key: "preferences", label: "Study habits" },
  { key: "done", label: "Done" },
];

export function OnboardingWizard({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const [step, setStep] = React.useState<OnboardingStepName>(initial.stepName === "done" ? "preferences" : initial.stepName);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const stepIndex = STEP_ORDER.indexOf(step);

  // Local state per step
  const [firstName, setFirstName] = React.useState(initial.firstName);
  const [lastName, setLastName] = React.useState(initial.lastName);
  const [institution, setInstitution] = React.useState(initial.institution);
  const [platform, setPlatform] = React.useState<string>(initial.platform ?? "");
  const [courses, setCourses] = React.useState<{ name: string; code: string; instructor: string }[]>(
    initial.courses.length ? initial.courses.map((c) => ({ name: c.name, code: c.code ?? "", instructor: c.instructor ?? "" })) : [{ name: "", code: "", instructor: "" }],
  );
  const prefs = initial.preferences ?? {};
  const [startHour, setStartHour] = React.useState<number>(Number(prefs.preferredStartHour ?? 17));
  const [endHour, setEndHour] = React.useState<number>(Number(prefs.preferredEndHour ?? 22));
  const [sessionMinutes, setSessionMinutes] = React.useState<number>(Number(prefs.sessionMinutes ?? 45));
  const [dailyMax, setDailyMax] = React.useState<number>(Number(prefs.dailyMaxMinutes ?? 180));
  const [studyDays, setStudyDays] = React.useState<number[]>((prefs.studyDays as number[] | undefined) ?? [1, 2, 3, 4, 5, 0]);
  const [mode, setMode] = React.useState<"LEARNING" | "GUIDED" | "REVIEW">(initial.assistanceMode);

  async function save(payload: Record<string, unknown>, next: OnboardingStepName) {
    setSaving(true);
    setErrors({});
    try {
      await apiPatch("/api/onboarding", payload);
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiClientError && err.details) setErrors(err.details);
      else toast.error(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      const res = await apiPost<{ next: string }>("/api/onboarding");
      router.push(res.next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish setup.");
      setSaving(false);
    }
  }

  const back = () => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)]!);

  return (
    <div className="animate-slide-up">
      <ol className="mb-8 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="Setup progress">
        {steps.map((s, i) => {
          const done = i < stepIndex;
          const current = s.key === step;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-success text-white",
                  current && "bg-primary text-white ring-4 ring-brand-500/20",
                  !done && !current && "bg-surface-muted text-subtle",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-xs font-medium", current ? "text-foreground" : "text-subtle")}>{s.label}</span>
              {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {step === "profile" ? (
          <StepShell title="What should we call you?" description="Your name appears on your dashboard and in AI conversations.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="firstName" label="First name" required error={errors.firstName}>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </Field>
              <Field id="lastName" label="Last name" error={errors.lastName}>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Nav onNext={() => save({ step: "profile", firstName, lastName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, "institution")} saving={saving} />
          </StepShell>
        ) : null}

        {step === "institution" ? (
          <StepShell title="Where do you study?" description="This tunes grading scales, terms and LMS defaults. You can change it later.">
            <InstitutionPicker value={institution} onChange={setInstitution} />
            <Nav
              onBack={back}
              onNext={() => save({ step: "institution", institutionId: institution?.id ?? null }, "platform")}
              nextLabel={institution ? "Continue" : "Skip for now"}
              saving={saving}
            />
          </StepShell>
        ) : null}

        {step === "platform" ? (
          <StepShell title="Which learning platform does your school use?" description="We will help you connect it after setup. You can always add tasks manually.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["CANVAS", "Canvas", "Instructure Canvas LMS"],
                ["MOODLE", "Moodle", "Moodle sites, including self-hosted"],
                ["BLACKBOARD", "Blackboard", "Blackboard Learn / Ultra"],
                ["OTHER", "Other", "A platform not listed here"],
                ["MANUAL", "I'll add tasks manually", "No LMS connection needed"],
              ].map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPlatform(value!)}
                  aria-pressed={platform === value}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                    platform === value ? "border-brand-400 bg-primary-soft ring-4 ring-brand-500/15" : "border-border hover:border-border-strong hover:bg-surface-muted",
                  )}
                >
                  <span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border", platform === value ? "border-primary bg-primary text-white" : "border-border-strong")}>
                    {platform === value ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <Nav onBack={back} onNext={() => save({ step: "platform", platform: platform || "MANUAL" }, "courses")} saving={saving} />
          </StepShell>
        ) : null}

        {step === "courses" ? (
          <StepShell title="Add your courses" description="Start with the ones you are taking this term. You can add more anytime.">
            <div className="space-y-3">
              {courses.map((c, i) => (
                <div key={i} className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[1.5fr_0.7fr_1fr_auto] sm:items-end">
                  <Field id={`course-${i}-name`} label="Course name" required error={errors[`courses.${i}.name`]}>
                    <Input value={c.name} placeholder="Database Systems" onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field id={`course-${i}-code`} label="Code">
                    <Input value={c.code} placeholder="CS301" onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
                  </Field>
                  <Field id={`course-${i}-instructor`} label="Instructor">
                    <Input value={c.instructor} placeholder="Prof. Santos" onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, instructor: e.target.value } : x)))} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove course" onClick={() => setCourses((cs) => cs.filter((_, j) => j !== i))} disabled={courses.length === 1}>
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCourses((cs) => [...cs, { name: "", code: "", instructor: "" }])} disabled={courses.length >= 12}>
                <PlusIcon /> Add another course
              </Button>
            </div>
            <Nav
              onBack={back}
              onNext={() => save({ step: "courses", courses: courses.filter((c) => c.name.trim()) }, "preferences")}
              nextLabel={courses.some((c) => c.name.trim()) ? "Continue" : "Skip for now"}
              saving={saving}
            />
          </StepShell>
        ) : null}

        {step === "preferences" ? (
          <StepShell title="How do you like to study?" description="AI Hub uses this to plan sessions that fit your day.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="startHour" label="Usually start studying at" error={errors.preferredStartHour}>
                <Input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} />
              </Field>
              <Field id="endHour" label="Stop by" error={errors.preferredEndHour}>
                <Input type="number" min={1} max={24} value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} />
              </Field>
              <Field id="sessionMinutes" label="Preferred session length (min)" error={errors.sessionMinutes}>
                <Input type="number" min={15} max={180} step={5} value={sessionMinutes} onChange={(e) => setSessionMinutes(Number(e.target.value))} />
              </Field>
              <Field id="dailyMax" label="Max study time per day (min)" error={errors.dailyMaxMinutes}>
                <Input type="number" min={30} max={720} step={15} value={dailyMax} onChange={(e) => setDailyMax(Number(e.target.value))} />
              </Field>
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Study days</p>
              <div className="flex flex-wrap gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                  const on = studyDays.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setStudyDays((ds) => (on ? ds.filter((x) => x !== i) : [...ds, i]))}
                      className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition", on ? "border-primary bg-primary text-white" : "border-border text-muted hover:border-border-strong")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              {errors.studyDays ? <p className="mt-1 text-xs text-danger">{errors.studyDays}</p> : null}
            </div>
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium">Default AI assistance mode</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["LEARNING", "Learning", "Hints first. Answers only after you try."],
                    ["GUIDED", "Guided", "Step-by-step explanations and examples."],
                    ["REVIEW", "Review", "Feedback on work you have already done."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={cn("rounded-2xl border p-4 text-left transition", mode === value ? "border-brand-400 bg-primary-soft ring-4 ring-brand-500/15" : "border-border hover:bg-surface-muted")}
                  >
                    <Badge variant={mode === value ? "solid" : "brand"}>{label}</Badge>
                    <p className="mt-2 text-xs text-muted">{hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <Nav
              onBack={back}
              onNext={() =>
                save(
                  { step: "preferences", preferredStartHour: startHour, preferredEndHour: endHour, sessionMinutes, studyDays, dailyMaxMinutes: dailyMax, defaultAssistanceMode: mode },
                  "done",
                )
              }
              saving={saving}
            />
          </StepShell>
        ) : null}

        {step === "done" ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl brand-gradient text-white shadow-md">
              <GraduationCapIcon className="size-8" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Your hub is ready, {firstName || "there"}</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Add your first assignments, upload notes, or ask the AI Tutor what to study tonight. Everything else is waiting on your dashboard.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" onClick={back} disabled={saving}>
                <ArrowLeftIcon /> Back
              </Button>
              <Button size="lg" variant="gradient" onClick={finish} loading={saving}>
                Go to dashboard <ArrowRightIcon />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Continue", saving }: { onBack?: () => void; onNext: () => void; nextLabel?: string; saving: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
          <ArrowLeftIcon /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={onNext} loading={saving}>
        {nextLabel} <ArrowRightIcon />
      </Button>
    </div>
  );
}

function InstitutionPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string; defaultLms: string | null } | null;
  onChange: (v: { id: string; name: string; defaultLms: string | null } | null) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<InstitutionOption[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [customName, setCustomName] = React.useState("");
  const [customCountry, setCustomCountry] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet<{ institutions: InstitutionOption[] }>(`/api/institutions?q=${encodeURIComponent(query)}`)
        .then((res) => {
          if (!cancelled) setOptions(res.institutions);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function createCustom() {
    if (customName.trim().length < 2) return;
    setCreating(true);
    try {
      const res = await apiPost<{ institution: InstitutionOption }>("/api/institutions", { name: customName, country: customCountry || null });
      onChange({ id: res.institution.id, name: res.institution.name, defaultLms: res.institution.defaultLms });
      toast.success("Institution added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add institution");
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-300 bg-primary-soft p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface text-brand-600 dark:text-brand-300">
            <GraduationCapIcon className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{value.name}</p>
            {value.defaultLms ? <p className="text-xs text-muted">Usually uses {value.defaultLms.charAt(0) + value.defaultLms.slice(1).toLowerCase()}</p> : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input leftIcon={<MagnifyingGlassIcon />} placeholder="Search your school or university" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-2xl border border-border scrollbar-thin" role="listbox" aria-label="Institutions">
        {options.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">No matches yet.</li> : null}
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChange({ id: o.id, name: o.name, defaultLms: o.defaultLms })}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface-muted"
            >
              <span>
                <span className="block font-medium">{o.name}</span>
                <span className="block text-xs text-muted">{[o.city, o.country].filter(Boolean).join(", ")}</span>
              </span>
              {o.isVerified ? <Badge variant="success">Verified</Badge> : <Badge>Community</Badge>}
            </button>
          </li>
        ))}
      </ul>
      <details className="rounded-2xl border border-dashed border-border-strong p-4">
        <summary className="cursor-pointer text-sm font-medium">My school isn&apos;t listed</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <Field id="customName" label="Institution name" required>
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Northside Community College" />
          </Field>
          <Field id="customCountry" label="Country">
            <Input value={customCountry} onChange={(e) => setCustomCountry(e.target.value)} placeholder="Philippines" />
          </Field>
          <Button type="button" onClick={createCustom} loading={creating} disabled={customName.trim().length < 2}>
            Add
          </Button>
        </div>
      </details>
    </div>
  );
}
