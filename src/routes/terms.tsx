import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/findable-icons";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — findable" },
      {
        name: "description",
        content:
          "The Terms of Service for findable.work, an AI-powered recruiting assistant.",
      },
      { property: "og:title", content: "Terms of Service — findable" },
      {
        property: "og:description",
        content:
          "The Terms of Service for findable.work, an AI-powered recruiting assistant.",
      },
    ],
  }),
  component: TermsPage,
});

const EFFECTIVE_DATE = "May 29, 2026";
const LAST_UPDATED = "May 29, 2026";

function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 text-[var(--text)]">
            <Wordmark height={32} />
          </Link>
          <Link
            to="/"
            className="text-[13px] text-[var(--text-mute)] hover:text-[var(--text)]"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-12">
        <article className="prose-findable">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            Terms of Service
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--text-mute)]">
            <strong>Effective Date:</strong> {EFFECTIVE_DATE}
            <br />
            <strong>Last Updated:</strong> {LAST_UPDATED}
          </p>

          <Section>
            <P>
              These Terms of Service (“<strong>Terms</strong>”) govern your access to and use of{" "}
              <strong>findable.work</strong>, an AI-powered recruiting assistant provided by{" "}
              <strong>Virgilio Technologies LLC</strong>, a Delaware limited liability company
              located at <strong>131 Continental Dr, Suite 305, Newark, Delaware 19713</strong> (
              “<strong>findable.work</strong>,” “<strong>Virgilio</strong>,” “<strong>we</strong>,” “
              <strong>us</strong>,” or “<strong>our</strong>”).
            </P>
            <P>
              By accessing or using findable.work, you agree to these Terms. If you are using the
              service on behalf of a company or other organization, you represent that you have
              authority to bind that organization, and “you” refers to both you and that
              organization.
            </P>
            <P>If you do not agree to these Terms, do not use findable.work.</P>
            <P>
              Contact: <A href="mailto:support@findable.work">support@findable.work</A>
            </P>
          </Section>

          <H2>1. The Service</H2>
          <P>
            findable.work is an AI-powered recruiting assistant that helps users describe roles,
            create job descriptions, generate job posts, source potential candidates, draft
            outreach, and manage recruiting pipelines.
          </P>
          <P>The Service may include features such as:</P>
          <UL>
            <li>Conversational intake for role definition.</li>
            <li>AI-generated job descriptions.</li>
            <li>AI-generated job post variants.</li>
            <li>Candidate sourcing from third-party professional data providers.</li>
            <li>Candidate match scoring and ranking.</li>
            <li>Outreach drafting for email or LinkedIn.</li>
            <li>Follow-up sequence drafting.</li>
            <li>Pipeline and stage tracking.</li>
            <li>Interview scheduling workflows.</li>
            <li>Usage credits, paid plans, or credit packs.</li>
            <li>Guest preview mode before account creation.</li>
          </UL>
          <P>The Service is intended for professional and business recruiting use.</P>

          <H2>2. Eligibility</H2>
          <P>You must be at least 18 years old to use findable.work.</P>
          <P>
            You may only use the Service for lawful business or professional purposes. You may not
            use the Service if you are legally prohibited from doing so or if we have previously
            suspended or terminated your access.
          </P>

          <H2>3. Accounts</H2>
          <P>
            To access certain features, you must create an account. You agree to provide accurate,
            current, and complete account information and to keep that information updated.
          </P>
          <P>
            You are responsible for maintaining the confidentiality of your login credentials and
            for all activity under your account or workspace.
          </P>
          <P>You must notify us promptly if you believe your account has been compromised.</P>
          <P>
            We may support account creation through email/password login, Google OAuth, or other
            authentication methods.
          </P>

          <H2>4. Guest Mode</H2>
          <P>
            findable.work may allow visitors to use a limited guest preview experience before
            creating an account.
          </P>
          <P>
            In guest mode, you may chat with the AI assistant and generate a draft role or job
            description. Guest conversations may be stored locally in your browser session. If you
            create an account, your guest conversation may be associated with your account so you
            can continue your work.
          </P>
          <P>Guest mode may be limited, changed, or discontinued at any time.</P>

          <H2>5. Customer Content</H2>
          <P>
            “<strong>Customer Content</strong>” means information, text, files, prompts, messages,
            job briefs, job descriptions, job posts, notes, candidate lists, outreach drafts, and
            other content that you submit to, generate through, or store in the Service.
          </P>
          <P>You retain ownership of your Customer Content, subject to the rights granted in these Terms.</P>
          <P>
            You grant findable.work a worldwide, non-exclusive, royalty-free license to host,
            store, process, transmit, display, modify, and use Customer Content as necessary to
            provide, secure, support, and improve the Service.
          </P>
          <P>
            You represent and warrant that you have all rights and permissions necessary to submit
            Customer Content to the Service and to authorize us to process it under these Terms.
          </P>

          <H2>6. AI-Generated Output</H2>
          <P>
            The Service uses artificial intelligence to generate suggestions, drafts,
            recommendations, summaries, candidate matches, match scores, job descriptions, job
            posts, and outreach messages.
          </P>
          <P>
            AI-generated output may be inaccurate, incomplete, outdated, biased, or unsuitable for
            your intended use. You are responsible for reviewing, editing, and approving all
            AI-generated output before using it.
          </P>
          <P>
            findable.work does not guarantee that AI-generated output will be correct, lawful,
            non-infringing, compliant, unbiased, or appropriate for any particular hiring process.
          </P>
          <P>
            You must not rely on AI-generated output as the sole basis for employment, hiring,
            compensation, promotion, termination, or other legally significant decisions.
          </P>

          <H2>7. Candidate Data</H2>
          <P>
            The Service may display, store, enrich, organize, or process information about
            potential candidates. Candidate data may include names, roles, companies, work emails,
            phone numbers, LinkedIn profiles, locations, professional summaries, experience,
            education, profile images, professional identifiers, match scores, tags, notes, and
            pipeline activity.
          </P>
          <P>
            Candidate data may come from third-party professional data providers, public
            professional sources, enrichment providers, or information you provide.
          </P>
          <P>You understand and agree that:</P>
          <OL>
            <li>Candidate data may be incomplete, outdated, inaccurate, or incorrectly matched.</li>
            <li>
              findable.work does not guarantee the accuracy, completeness, legality, availability,
              or currentness of candidate data.
            </li>
            <li>Candidate data is provided for recruiting workflow assistance only.</li>
            <li>
              You are responsible for determining whether and how you may lawfully process, store,
              export, contact, or use candidate data.
            </li>
            <li>
              You must honor applicable candidate privacy rights, deletion requests, opt-outs, and
              communication preferences.
            </li>
            <li>
              You must not use candidate data for unlawful, discriminatory, invasive, harassing,
              or non-recruiting purposes.
            </li>
          </OL>

          <H2>8. Customer as Controller for Candidate Data</H2>
          <P>
            For candidate data that you source, select, store, contact, organize, or otherwise
            process through the Service, you are generally the data controller, business, or
            equivalent party under applicable privacy laws.
          </P>
          <P>
            findable.work generally acts as a processor, service provider, or vendor processing
            candidate data on your behalf and according to your instructions, except where we
            process information for our own business operations, security, compliance, or legal
            obligations.
          </P>
          <P>You are responsible for:</P>
          <UL>
            <li>Having a lawful basis to process candidate data.</li>
            <li>Providing required notices to candidates where applicable.</li>
            <li>Honoring candidate rights requests.</li>
            <li>Complying with privacy, employment, anti-discrimination, and communications laws.</li>
            <li>Ensuring that your use of candidate data is fair, lawful, and appropriate.</li>
            <li>Ensuring that outreach complies with applicable law and platform rules.</li>
          </UL>
          <P>
            If a candidate contacts us regarding data that is controlled by you, we may refer the
            request to you, coordinate with you, or take action as required by law.
          </P>

          <H2>9. Acceptable Use</H2>
          <P>You agree not to use findable.work to:</P>
          <OL>
            <li>Violate any law, regulation, or third-party right.</li>
            <li>
              Send spam, unlawful marketing, or unsolicited communications in violation of
              applicable law.
            </li>
            <li>Harass, intimidate, deceive, or harm any person.</li>
            <li>
              Make hiring decisions based on protected characteristics or discriminatory
              criteria.
            </li>
            <li>
              Search for, filter, rank, exclude, or target candidates based on unlawful or
              protected-class criteria.
            </li>
            <li>Use sensitive personal information in a way that violates applicable law.</li>
            <li>
              Resell, redistribute, sublicense, publish, or broker candidate data obtained
              through the Service.
            </li>
            <li>
              Build or enrich a competing people database, recruiting database, or data product.
            </li>
            <li>
              Scrape, crawl, harvest, or extract data from the Service except as expressly
              allowed by the Service.
            </li>
            <li>
              Reverse engineer, decompile, or attempt to discover the source code or underlying
              systems of the Service.
            </li>
            <li>Interfere with or disrupt the Service.</li>
            <li>
              Attempt to bypass usage limits, credits, authentication, security controls, or
              access restrictions.
            </li>
            <li>Upload malware, malicious code, or harmful content.</li>
            <li>Misrepresent your identity, affiliation, hiring intent, or authority.</li>
            <li>
              Use the Service for surveillance, background checks, credit decisions, insurance
              decisions, housing decisions, lending decisions, or other non-recruiting eligibility
              determinations.
            </li>
            <li>
              Use the Service in a way that violates the terms of third-party platforms, data
              providers, email providers, or social networks.
            </li>
          </OL>
          <P>We may suspend or terminate access if we believe you have violated this section.</P>

          <H2>10. Recruiting Outreach</H2>
          <P>
            findable.work may help draft recruiting outreach messages, follow-ups, subject lines,
            LinkedIn messages, or email templates.
          </P>
          <P>
            You are responsible for reviewing and approving all outreach before sending it. You
            are also responsible for ensuring that your outreach complies with applicable law,
            including laws related to email, electronic communications, privacy, employment,
            anti-discrimination, and unfair or deceptive practices.
          </P>
          <P>
            You agree not to use the Service to send or facilitate spam, deceptive outreach,
            unlawful automated messaging, or communications that violate candidate opt-outs or
            platform rules.
          </P>
          <P>
            Unless we expressly provide sending functionality, findable.work is a drafting and
            workflow tool and is not the sender of your recruiting communications.
          </P>

          <H2>11. Third-Party Services and Data Providers</H2>
          <P>
            The Service may rely on third-party services, including hosting providers,
            authentication providers, AI model providers, AI gateway providers, candidate data
            providers, payment processors, email providers, and other vendors.
          </P>
          <P>
            Third-party services may include providers such as Supabase, Cloudflare, Google,
            OpenAI, Lovable, Apollo, People Data Labs, Stripe, Resend, or similar providers.
          </P>
          <P>
            Your use of the Service may involve the transmission of Customer Content, candidate
            data, account information, usage data, or payment-related information to third-party
            providers as necessary to provide the Service.
          </P>
          <P>
            We are not responsible for third-party services, third-party data, third-party
            websites, or third-party terms, except as required by applicable law or an
            applicable written agreement.
          </P>
          <P>
            Candidate data provided by third-party data providers is subject to change and may be
            removed, limited, modified, or discontinued at any time.
          </P>

          <H2>12. Plans, Credits, and Billing</H2>
          <P>
            findable.work may offer free plans, paid plans, subscriptions, credit packs,
            usage-based billing, or other pricing models.
          </P>
          <P>
            Certain actions, including candidate sourcing, enrichment, AI usage, or project
            creation, may consume credits or count against usage limits.
          </P>
          <P>
            You agree to pay all fees associated with your selected plan, subscription, credit
            purchase, or usage. Payments may be processed by Stripe or another third-party
            payment provider.
          </P>
          <P>Unless otherwise stated:</P>
          <UL>
            <li>Fees are due at the time of purchase or renewal.</li>
            <li>Consumed credits are non-refundable.</li>
            <li>Unused credits may expire according to the terms presented at purchase.</li>
            <li>Free credits have no cash value.</li>
            <li>
              We may change pricing, plans, features, limits, and credit rules with notice where
              required.
            </li>
            <li>Taxes, VAT, duties, or similar charges may apply and are your responsibility.</li>
          </UL>
          <P>If payment fails, we may suspend or limit access to paid features.</P>

          <H2>13. Trials, Free Plans, and Beta Features</H2>
          <P>
            We may offer free plans, trials, previews, beta features, or experimental features.
          </P>
          <P>
            These features may be limited, modified, suspended, or discontinued at any time. Beta
            and experimental features are provided “as is” and may be unstable, incomplete, or
            inaccurate.
          </P>
          <P>
            We do not guarantee that any free, trial, beta, or experimental feature will become
            generally available.
          </P>

          <H2>14. Admin and Workspace Access</H2>
          <P>
            If you use findable.work as part of a company, team, or workspace, workspace
            administrators may be able to access, manage, export, delete, or restrict access to
            workspace content and user accounts.
          </P>
          <P>
            You are responsible for managing your workspace users, permissions, and access rights.
          </P>
          <P>
            We are not responsible for internal disputes between workspace owners,
            administrators, employees, contractors, or other users.
          </P>

          <H2>15. Data Protection</H2>
          <P>
            Our collection and use of personal information is described in our Privacy Policy.
          </P>
          <P>
            By using the Service, you agree that we may process personal information as described
            in the Privacy Policy and these Terms.
          </P>
          <P>
            If your use of the Service requires a data processing agreement, contact us at{" "}
            <A href="mailto:support@findable.work">support@findable.work</A>. We may provide a
            separate Data Processing Addendum where appropriate.
          </P>

          <H2>16. Confidentiality</H2>
          <P>
            “<strong>Confidential Information</strong>” means non-public information disclosed by
            one party to the other that should reasonably be understood to be confidential,
            including business, technical, product, pricing, security, roadmap, customer,
            candidate, and financial information.
          </P>
          <P>
            Each party agrees to use the other party’s Confidential Information only as necessary
            to perform under these Terms and to protect it using reasonable care.
          </P>
          <P>
            Confidential Information does not include information that is public, independently
            developed, rightfully received from another source, or already known without
            confidentiality obligations.
          </P>

          <H2>17. Intellectual Property</H2>
          <P>
            findable.work and its software, design, workflows, prompts, prompt systems, models
            orchestration, interfaces, algorithms, databases, logos, trademarks, content, and
            technology are owned by Virgilio Technologies LLC or its licensors.
          </P>
          <P>
            Except for the limited right to use the Service under these Terms, no rights are
            transferred to you.
          </P>
          <P>
            You may not copy, modify, distribute, sell, lease, sublicense, reverse engineer, or
            create derivative works from the Service unless expressly permitted by law or by us in
            writing.
          </P>

          <H2>18. Feedback</H2>
          <P>
            If you provide feedback, suggestions, ideas, bug reports, or recommendations, you
            grant us a worldwide, perpetual, irrevocable, royalty-free license to use, modify,
            commercialize, and incorporate that feedback without restriction or compensation.
          </P>

          <H2>19. Service Availability and Changes</H2>
          <P>
            We may modify, suspend, discontinue, or limit any part of the Service at any time.
          </P>
          <P>
            We do not guarantee that the Service will be uninterrupted, secure, error-free, or
            available at all times.
          </P>
          <P>
            We may perform maintenance, updates, or changes that affect availability or
            functionality.
          </P>

          <H2>20. Suspension and Termination</H2>
          <P>You may stop using the Service at any time.</P>
          <P>We may suspend or terminate your access if:</P>
          <UL>
            <li>You violate these Terms.</li>
            <li>You fail to pay required fees.</li>
            <li>Your use creates legal, security, operational, or reputational risk.</li>
            <li>We are required to do so by law.</li>
            <li>Your account is inactive for an extended period.</li>
            <li>We discontinue the Service.</li>
          </UL>
          <P>Upon termination, your right to use the Service ends immediately.</P>
          <P>
            We may retain certain information as required by law, for legitimate business
            purposes, to resolve disputes, to enforce agreements, or as described in our Privacy
            Policy.
          </P>

          <H2>21. Disclaimers</H2>
          <P>THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.”</P>
          <P>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS,
            IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS
            FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AVAILABILITY, AND QUIET
            ENJOYMENT.
          </P>
          <P>WE DO NOT WARRANT THAT:</P>
          <UL>
            <li>
              THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR AVAILABLE AT ALL TIMES.
            </li>
            <li>
              CANDIDATE DATA WILL BE ACCURATE, COMPLETE, CURRENT, OR LAWFULLY USABLE IN YOUR
              JURISDICTION.
            </li>
            <li>
              AI-GENERATED OUTPUT WILL BE ACCURATE, COMPLIANT, UNBIASED, OR APPROPRIATE.
            </li>
            <li>
              THE SERVICE WILL RESULT IN HIRES, INTERVIEWS, RESPONSES, REVENUE, OR BUSINESS
              OUTCOMES.
            </li>
            <li>
              OUTREACH GENERATED THROUGH THE SERVICE WILL BE LAWFUL OR EFFECTIVE WITHOUT YOUR
              REVIEW.
            </li>
          </UL>
          <P>
            You are solely responsible for your hiring decisions, communications, candidate
            processing, and use of the Service.
          </P>

          <H2>22. Limitation of Liability</H2>
          <P>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VIRGILIO TECHNOLOGIES LLC AND ITS AFFILIATES,
            OFFICERS, EMPLOYEES, CONTRACTORS, AGENTS, SUPPLIERS, AND LICENSORS WILL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
            DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, BUSINESS OPPORTUNITY,
            OR BUSINESS INTERRUPTION.
          </P>
          <P>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT
            OF OR RELATING TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF:
          </P>
          <OL>
            <li>
              THE AMOUNT YOU PAID TO US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT
              GIVING RISE TO THE CLAIM; OR
            </li>
            <li>USD $100.</li>
          </OL>
          <P>
            Some jurisdictions do not allow certain limitations of liability, so some of the
            above limitations may not apply to you.
          </P>

          <H2>23. Indemnification</H2>
          <P>
            You agree to defend, indemnify, and hold harmless Virgilio Technologies LLC and its
            affiliates, officers, employees, contractors, agents, suppliers, and licensors from
            and against any claims, damages, liabilities, losses, costs, and expenses, including
            reasonable attorneys’ fees, arising out of or related to:
          </P>
          <UL>
            <li>Your use of the Service.</li>
            <li>Your Customer Content.</li>
            <li>Your recruiting activity.</li>
            <li>Your candidate sourcing, outreach, communications, or hiring decisions.</li>
            <li>Your violation of these Terms.</li>
            <li>Your violation of applicable law.</li>
            <li>Your violation of candidate, employee, applicant, or third-party rights.</li>
            <li>Your use, export, resale, disclosure, or misuse of candidate data.</li>
            <li>Your discriminatory, unlawful, deceptive, or spam-related conduct.</li>
          </UL>
          <P>
            We reserve the right to control the defense of any matter subject to
            indemnification. You agree to cooperate with our defense.
          </P>

          <H2>24. Governing Law</H2>
          <P>
            These Terms are governed by the laws of the State of Delaware, without regard to
            conflict of law principles.
          </P>
          <P>
            Subject to the dispute resolution section below, the state and federal courts located
            in Delaware will have exclusive jurisdiction over disputes arising out of or relating
            to these Terms or the Service.
          </P>

          <H2>25. Dispute Resolution</H2>
          <P>
            Before filing a claim, you agree to first contact us at{" "}
            <A href="mailto:support@findable.work">support@findable.work</A> and attempt to
            resolve the dispute informally.
          </P>
          <P>
            If we cannot resolve the dispute informally within 30 days, either party may bring a
            claim in the courts described in the Governing Law section, unless a separate written
            agreement between you and us provides otherwise.
          </P>
          <P>
            Either party may seek injunctive or equitable relief to protect intellectual property,
            confidential information, security, or unauthorized use of the Service.
          </P>

          <H2>26. Export and Sanctions Compliance</H2>
          <P>
            You may not use the Service in violation of export control laws, sanctions, or trade
            restrictions.
          </P>
          <P>
            You represent that you are not located in, organized under the laws of, or ordinarily
            resident in any country or territory subject to comprehensive sanctions, and that you
            are not on any restricted party list.
          </P>

          <H2>27. Changes to These Terms</H2>
          <P>We may update these Terms from time to time.</P>
          <P>
            If we make material changes, we may notify you by email, in-app notice, or by updating
            the “Last Updated” date above.
          </P>
          <P>
            Your continued use of the Service after updated Terms become effective means you
            accept the updated Terms.
          </P>
          <P>If you do not agree to the updated Terms, you must stop using the Service.</P>

          <H2>28. Assignment</H2>
          <P>You may not assign or transfer these Terms without our prior written consent.</P>
          <P>
            We may assign or transfer these Terms in connection with a merger, acquisition,
            financing, reorganization, sale of assets, corporate transaction, or by operation of
            law.
          </P>

          <H2>29. Severability</H2>
          <P>
            If any provision of these Terms is found unenforceable, the remaining provisions will
            remain in full force and effect.
          </P>
          <P>
            The unenforceable provision will be modified to the minimum extent necessary to make
            it enforceable, or removed if modification is not possible.
          </P>

          <H2>30. No Waiver</H2>
          <P>
            Our failure to enforce any provision of these Terms does not waive our right to
            enforce that provision later.
          </P>

          <H2>31. Entire Agreement</H2>
          <P>
            These Terms, together with the Privacy Policy and any applicable order form,
            subscription terms, or written agreement, constitute the entire agreement between you
            and Virgilio Technologies LLC regarding the Service.
          </P>
          <P>
            If there is a conflict between these Terms and a separately signed written agreement,
            the signed written agreement will control for that customer.
          </P>

          <H2>32. Contact</H2>
          <P>For questions about these Terms, contact:</P>
          <P>
            <strong>Virgilio Technologies LLC</strong>
            <br />
            131 Continental Dr, Suite 305
            <br />
            Newark, Delaware 19713
            <br />
            United States
          </P>
          <P>
            Email: <A href="mailto:support@findable.work">support@findable.work</A>
          </P>
        </article>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-5 text-[13px] text-[var(--text-mute)]">
          <span>© 2026 findable</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-[var(--text)]">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-[var(--text)]">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="mt-8">{children}</div>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)]">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-[15px] font-semibold text-[var(--text)]">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[14px] leading-[1.65] text-[var(--text-mid)]">
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.65] text-[var(--text-mid)]">
      {children}
    </ul>
  );
}

function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.65] text-[var(--text-mid)]">
      {children}
    </ol>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="underline decoration-[var(--border-strong)] underline-offset-3 hover:text-[var(--text)]"
    >
      {children}
    </a>
  );
}
