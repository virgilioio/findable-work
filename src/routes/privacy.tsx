import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/findable-icons";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — findable" },
      {
        name: "description",
        content:
          "How findable.work collects, uses, shares, and protects personal information.",
      },
      { property: "og:title", content: "Privacy Policy — findable" },
      {
        property: "og:description",
        content:
          "How findable.work collects, uses, shares, and protects personal information.",
      },
    ],
  }),
  component: PrivacyPage,
});

const EFFECTIVE_DATE = "May 29, 2026";
const LAST_UPDATED = "May 30, 2026";

function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--text-mute)]">
            <strong>Effective Date:</strong> {EFFECTIVE_DATE}
            <br />
            <strong>Last Updated:</strong> {LAST_UPDATED}
          </p>

          <Section>
            <P>
              This Privacy Policy explains how <strong>Virgilio Technologies LLC</strong>, a
              Delaware limited liability company located at{" "}
              <strong>131 Continental Dr, Suite 305, Newark, Delaware 19713</strong> (
              "<strong>findable.work</strong>," "<strong>Virgilio</strong>,"{" "}
              "<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>"),
              collects, uses, shares, and protects personal information in connection with{" "}
              <strong>findable.work</strong>, an AI-powered recruiting assistant.
            </P>
            <P>
              You may contact us at{" "}
              <A href="mailto:support@findable.work">support@findable.work</A>.
            </P>
          </Section>

          <H2>1. What findable.work does</H2>
          <P>
            findable.work helps hiring teams describe roles, create job descriptions, generate
            job posts, source potential candidates, draft recruiting outreach, and manage
            candidate pipelines.
          </P>
          <P>
            The service uses artificial intelligence and third-party professional data
            providers to help users find people who may match a hiring need. Candidate results
            may include professional and contact information obtained from third-party data
            providers, public professional sources, or information provided by our users.
          </P>

          <H2>2. Who this policy applies to</H2>
          <P>This Privacy Policy applies to:</P>
          <OL>
            <li>
              <strong>Account holders and workspace users</strong>, such as founders, hiring
              managers, recruiters, and other people who create or use a findable.work
              account.
            </li>
            <li>
              <strong>Guest users</strong>, who interact with the product before creating an
              account.
            </li>
            <li>
              <strong>Candidates or potential candidates</strong>, whose professional
              information may appear in candidate search results or recruiting pipelines, even
              if they do not use or sign in to findable.work.
            </li>
            <li>
              <strong>Website visitors</strong>, who visit our website or interact with our
              pages.
            </li>
          </OL>

          <H2>3. Information we collect</H2>

          <H3>A. Account and login information</H3>
          <P>When you create an account, we may collect:</P>
          <UL>
            <li>Name, if provided.</li>
            <li>Email address.</li>
            <li>Password credentials, if you use email/password login.</li>
            <li>Google OAuth identity information, if you sign in with Google.</li>
            <li>Account plan, usage limits, credits remaining, and account role.</li>
            <li>Payment-related identifiers, such as Stripe session IDs or billing records.</li>
          </UL>
          <P>
            We do not directly store full payment card numbers. Payments are processed by our
            payment provider.
          </P>

          <H3>B. Guest session information</H3>
          <P>
            If you use the guest preview experience, you may chat with our AI assistant before
            creating an account. Your guest conversation may be stored locally in your browser
            using session storage. If you create an account, we may associate or "claim" that
            guest conversation into your account so you can continue your work.
          </P>

          <H3>C. Chat, prompts, and recruiting workflow information</H3>
          <P>
            When you use findable.work, we collect and store information you submit or
            generate through the product, including:
          </P>
          <UL>
            <li>Chat conversations and messages with the AI assistant.</li>
            <li>
              Job descriptions, job requirements, job titles, locations, compensation ranges,
              employment type, and other role information.
            </li>
            <li>
              AI-generated job posts, outreach drafts, follow-up sequences, and suggested
              campaign schedules.
            </li>
            <li>
              Sourcing project information, candidate shortlists, project status, and usage or
              credit history.
            </li>
            <li>Candidate pipeline stages, notes, tags, activity logs, and contact status.</li>
            <li>Internal prompt and task information necessary to operate the service.</li>
          </UL>
          <P>
            Please do not submit sensitive personal information unless it is necessary for
            your use of the service and you have the right to provide it.
          </P>

          <H3>D. Candidate and professional profile information</H3>
          <P>
            findable.work may display, process, and store candidate-related information,
            including:
          </P>
          <UL>
            <li>Name.</li>
            <li>Current or past role.</li>
            <li>Company.</li>
            <li>Work email.</li>
            <li>Phone number.</li>
            <li>LinkedIn profile or slug.</li>
            <li>Location.</li>
            <li>Professional summary.</li>
            <li>Work experience.</li>
            <li>Education.</li>
            <li>Avatar or profile image.</li>
            <li>Professional identifiers from third-party data providers.</li>
            <li>Match score, pipeline stage, tags, and activity history.</li>
            <li>Contact timestamps and communication channel.</li>
          </UL>
          <P>
            This information may come from third-party professional data providers, public
            professional sources, enrichment providers, or users of the service.
          </P>
          <P>
            Candidates are not required to create an account with findable.work for their
            professional information to appear in the service.
          </P>

          <H3>E. Outreach information</H3>
          <P>If users create outreach through findable.work, we may store:</P>
          <UL>
            <li>Email or LinkedIn outreach drafts.</li>
            <li>Message subjects and bodies.</li>
            <li>Tone, personalization settings, and follow-up sequences.</li>
            <li>Contact timestamps and channel information.</li>
            <li>Reply-pause or send-time rules, if enabled.</li>
          </UL>
          <P>
            Unless we expressly provide sending functionality, findable.work provides drafting
            and workflow tools. The customer or recruiter remains responsible for deciding
            whether and how to contact candidates.
          </P>

          <H3>F. Technical and usage information</H3>
          <P>We may collect technical information such as:</P>
          <UL>
            <li>IP address.</li>
            <li>Device and browser information.</li>
            <li>Log data.</li>
            <li>Authentication session information.</li>
            <li>Product usage events.</li>
            <li>Error logs.</li>
            <li>Security and fraud-prevention signals.</li>
          </UL>
          <P>
            We may use cookies, local storage, session storage, or similar technologies to
            operate authentication, maintain sessions, remember product state, and provide
            core functionality.
          </P>

          <H2>4. How we use information</H2>
          <P>We use personal information to:</P>
          <UL>
            <li>Create and manage user accounts.</li>
            <li>Authenticate users.</li>
            <li>Provide and improve the findable.work service.</li>
            <li>
              Generate job descriptions, job posts, outreach drafts, and candidate search
              queries.
            </li>
            <li>Source, display, rank, and organize candidate results.</li>
            <li>Track usage, credits, sourcing projects, and billing events.</li>
            <li>Provide customer support.</li>
            <li>Send service-related communications.</li>
            <li>Maintain security and prevent abuse.</li>
            <li>Debug, monitor, and improve product performance.</li>
            <li>Enforce our Terms of Service and acceptable use rules.</li>
            <li>Comply with legal obligations.</li>
          </UL>
          <P>
            We may use aggregated, de-identified, or anonymized information to analyze and
            improve the service.
          </P>

          <H2>5. AI processing</H2>
          <P>
            findable.work uses AI models and AI infrastructure providers to provide core
            product functionality, including chat, clarifying questions, job description
            drafting, candidate matching assistance, outreach drafting, and workflow
            automation.
          </P>
          <P>
            When you use the service, your inputs, job information, messages, candidate
            snippets, and generated outputs may be sent to AI providers or AI gateway
            providers for processing.
          </P>
          <P>
            AI-generated outputs may be inaccurate, incomplete, outdated, biased, or
            unsuitable for a particular use. Users are responsible for reviewing AI-generated
            job descriptions, outreach messages, candidate recommendations, match scores, and
            other outputs before using them.
          </P>
          <P>
            findable.work does not intentionally use customer content to train public AI
            models. However, AI providers may process data according to their own data
            processing terms, security commitments, and retention practices.
          </P>

          <H2>6. Legal bases for processing</H2>
          <P>
            Where applicable law requires a legal basis, we process personal information under
            one or more of the following legal bases:
          </P>
          <UL>
            <li>
              <strong>Contract:</strong> to provide the service you requested, including
              account access, workspace functionality, and billing.
            </li>
            <li>
              <strong>Legitimate interests:</strong> to operate, secure, improve, and market
              the service; prevent abuse; support recruiting workflows; and provide
              business-to-business recruiting functionality.
            </li>
            <li>
              <strong>Consent:</strong> where we ask for consent, such as for certain optional
              communications or cookies.
            </li>
            <li>
              <strong>Legal obligation:</strong> to comply with applicable laws, accounting
              rules, tax requirements, or lawful requests.
            </li>
            <li>
              <strong>Customer instructions:</strong> where we process candidate data on
              behalf of a customer who uses findable.work for recruiting purposes.
            </li>
          </UL>

          <H2>7. Candidate data and customer responsibility</H2>
          <P>
            For account information and product operations, Virgilio Technologies LLC
            generally acts as the controller of personal information.
          </P>
          <P>
            For candidate information that a customer sources, stores, organizes, contacts, or
            otherwise processes through findable.work, the customer is generally the
            controller of that candidate information, and findable.work acts as a processor or
            service provider acting on the customer's instructions.
          </P>
          <P>
            Customers are responsible for ensuring that they have a lawful basis to process
            candidate information, contact candidates, use recruiting outreach, and make
            hiring-related decisions. Customers must not use findable.work to discriminate,
            process unlawful hiring criteria, send spam, violate recruiting or communications
            laws, or violate the rights of candidates.
          </P>

          <H2>8. How we share information</H2>
          <P>We may share personal information with:</P>

          <H3>A. Service providers and subprocessors</H3>
          <P>We use third-party service providers to operate findable.work. These may include:</P>
          <UL>
            <li>Hosting, database, and authentication providers.</li>
            <li>Serverless infrastructure providers.</li>
            <li>AI model and AI gateway providers.</li>
            <li>Candidate data and enrichment providers.</li>
            <li>Payment processors.</li>
            <li>Email and transactional message providers.</li>
            <li>Security, logging, analytics, and support tools.</li>
          </UL>
          <P>These providers process information to help us deliver the service.</P>

          <H3>B. Third-party candidate data providers</H3>
          <P>
            Candidate information may be obtained from or enriched through third-party
            professional data providers. These providers may maintain their own privacy
            notices, data rights processes, and opt-out mechanisms.
          </P>

          <H3>C. Customers and workspace users</H3>
          <P>
            Candidate records, job information, messages, notes, outreach drafts, and pipeline
            activity may be visible to authorized users within the relevant customer
            workspace.
          </P>

          <H3>D. Legal and safety disclosures</H3>
          <P>We may disclose information if we believe it is necessary to:</P>
          <UL>
            <li>Comply with law or legal process.</li>
            <li>
              Protect the rights, safety, or property of findable.work, our users, candidates,
              or others.
            </li>
            <li>Investigate fraud, abuse, security incidents, or violations of our Terms.</li>
            <li>Enforce our agreements.</li>
          </UL>

          <H3>E. Business transfers</H3>
          <P>
            If we are involved in a merger, acquisition, financing, restructuring, sale of
            assets, or similar transaction, information may be disclosed or transferred as
            part of that transaction, subject to appropriate safeguards.
          </P>

          <H2>9. Payments</H2>
          <P>
            Payments, credits, subscriptions, and related billing events may be processed by
            Stripe or another payment provider. We may store payment-related identifiers,
            invoices, credit ledger information, plan information, and transaction status. We
            do not directly store full payment card numbers.
          </P>

          <H2>10. Cookies, local storage, and session storage</H2>
          <P>
            We may use cookies, local storage, session storage, and similar technologies to:
          </P>
          <UL>
            <li>Keep you signed in.</li>
            <li>Support authentication and account security.</li>
            <li>Store guest session conversations before signup.</li>
            <li>Remember product state.</li>
            <li>Improve performance and reliability.</li>
            <li>Prevent fraud or abuse.</li>
          </UL>
          <P>
            Guest conversations may be stored in session storage and may be cleared when the
            browser tab or session ends, depending on browser behavior. If a guest user signs
            up, the guest conversation may be associated with the new account.
          </P>

          <H2>11. Data retention</H2>
          <P>
            We retain personal information for as long as reasonably necessary to provide the
            service, comply with legal obligations, resolve disputes, enforce agreements, and
            maintain security.
          </P>
          <P>In general:</P>
          <UL>
            <li>Account information is retained while the account is active.</li>
            <li>
              Chat messages, conversations, jobs, job posts, outreach drafts, sourcing
              projects, and pipeline information are retained until deleted by the user,
              deleted by the workspace, or no longer needed.
            </li>
            <li>
              Candidate information may remain in a customer workspace until the customer
              removes it, deletes the workspace, or requests deletion.
            </li>
            <li>
              Billing records may be retained as required for tax, accounting, and compliance
              purposes.
            </li>
            <li>
              Logs and security records may be retained for a limited period for security,
              debugging, and abuse-prevention purposes.
            </li>
            <li>
              Backups may retain information for a limited period before being overwritten or
              deleted according to our backup practices.
            </li>
          </UL>

          <H2>12. Security</H2>
          <P>
            We use reasonable technical, administrative, and organizational measures designed
            to protect personal information. These may include access controls, HTTPS
            encryption in transit, authentication controls, database security rules,
            role-based access controls, and managed authentication infrastructure.
          </P>
          <P>
            No system is perfectly secure, and we cannot guarantee that information will never
            be accessed, disclosed, altered, or destroyed.
          </P>

          <H2>13. International data transfers</H2>
          <P>
            findable.work is operated by a United States company, and our service providers
            may process information in the United States and other countries. If you access
            the service from outside the United States, your information may be transferred
            to, stored in, or processed in countries that may not provide the same level of
            data protection as your jurisdiction.
          </P>
          <P>
            Where required, we rely on appropriate safeguards for international transfers,
            such as contractual protections or standard contractual clauses.
          </P>

          <H2>14. Your privacy rights</H2>
          <P>Depending on your location, you may have rights to:</P>
          <UL>
            <li>Access personal information we hold about you.</li>
            <li>Request correction of inaccurate information.</li>
            <li>Request deletion of information.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Request portability of certain information.</li>
            <li>Opt out of certain uses or disclosures.</li>
            <li>Withdraw consent where processing is based on consent.</li>
            <li>Appeal a privacy rights decision where applicable law provides that right.</li>
          </UL>
          <P>
            To exercise your rights, contact us at{" "}
            <A href="mailto:support@findable.work">support@findable.work</A>.
          </P>
          <P>
            We may need to verify your identity before responding. If you are a candidate
            whose information appears in a customer workspace, we may need to coordinate with
            the relevant customer, who may be the controller of your information.
          </P>

          <H2>15. Candidate rights and opt-out requests</H2>
          <P>
            If you are a candidate or potential candidate and believe your professional
            information appears in findable.work, you may contact us at{" "}
            <A href="mailto:support@findable.work">support@findable.work</A> to request
            access, deletion, correction, objection, or suppression.
          </P>
          <P>
            Please include enough information for us to locate your record, such as your name,
            work email, LinkedIn profile, current or past employer, and the nature of your
            request.
          </P>
          <P>
            Because some candidate information may come from third-party professional data
            providers, deleting or suppressing information from findable.work may not remove
            the information from the original third-party provider. You may also need to
            submit requests directly to the relevant third-party data provider.
          </P>
          <P>We will respond to verified privacy requests as required by applicable law.</P>

          <H2>16. California privacy notice</H2>
          <P>
            If you are a California resident, California law may provide additional rights
            regarding your personal information, including rights to know, delete, correct,
            limit, and opt out of certain sharing or sales of personal information.
          </P>
          <P>
            We do not knowingly sell personal information in the traditional sense of
            exchanging it for money. However, some privacy laws define "sale" or "sharing"
            broadly. To the extent our use of third-party candidate data or service providers
            is considered a sale, sharing, or disclosure under applicable law, you may contact
            us at <A href="mailto:support@findable.work">support@findable.work</A> to exercise
            your rights.
          </P>
          <P>
            We do not knowingly collect, sell, or share personal information of children under
            16.
          </P>

          <H2>17. European and UK users</H2>
          <P>
            If you are located in the European Economic Area, United Kingdom, or Switzerland,
            you may have additional rights under applicable data protection laws.
          </P>
          <P>
            For account holders, Virgilio Technologies LLC is generally the controller of
            account and service usage information.
          </P>
          <P>
            For candidate information processed at the direction of a customer, the customer
            is generally the controller, and findable.work processes that information as a
            processor.
          </P>
          <P>
            You may contact us at{" "}
            <A href="mailto:support@findable.work">support@findable.work</A> to exercise your
            rights. You may also have the right to lodge a complaint with your local data
            protection authority.
          </P>

          <H2>18. Recruiting, outreach, and communications compliance</H2>
          <P>
            Customers are responsible for ensuring that their recruiting activities comply
            with applicable laws and platform rules, including laws relating to email,
            electronic communications, privacy, employment, anti-discrimination, and candidate
            outreach.
          </P>
          <P>
            findable.work provides tools for drafting, organizing, and managing recruiting
            activity. Customers are responsible for reviewing outreach messages, confirming
            lawful basis, honoring opt-outs, and ensuring that candidate communications are
            appropriate and compliant.
          </P>

          <H2>19. Children</H2>
          <P>
            findable.work is intended for business and professional use. It is not directed to
            children under 18, and we do not knowingly collect personal information from
            children under 18.
          </P>

          <H2>20. Do Not Track</H2>
          <P>
            Some browsers offer "Do Not Track" signals. There is no uniform industry standard
            for responding to these signals. Unless required by law, we do not currently
            respond to Do Not Track signals.
          </P>

          <H2>21. Changes to this Privacy Policy</H2>
          <P>
            We may update this Privacy Policy from time to time. If we make material changes,
            we may notify users by email, in-app notice, or by updating the effective date
            above. Your continued use of the service after the updated Privacy Policy becomes
            effective means you acknowledge the updated policy.
          </P>

          <H2>22. Contact us</H2>
          <P>
            If you have questions or requests regarding this Privacy Policy or your personal
            information, contact:
          </P>
          <p className="mt-4 text-[14px] leading-[1.7] text-[var(--text)]">
            <strong>Virgilio Technologies LLC</strong>
            <br />
            131 Continental Dr, Suite 305
            <br />
            Newark, Delaware 19713
            <br />
            United States
          </p>
          <P>
            Email: <A href="mailto:support@findable.work">support@findable.work</A>
          </P>
        </article>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[760px] items-center gap-3.5 px-6 py-6 text-[12px] text-[var(--text-faint)]">
          <span>© 2026 findable</span>
          <span>·</span>
          <Link to="/privacy" className="hover:text-[var(--text-mute)]">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mt-6">{children}</section>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 text-[20px] font-semibold tracking-[-0.01em] text-[var(--text)]">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-[15.5px] font-semibold text-[var(--text)]">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[14px] leading-[1.7] text-[var(--text-mute)]">{children}</p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.7] text-[var(--text-mute)] marker:text-[var(--text-faint)]">
      {children}
    </ul>
  );
}

function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.7] text-[var(--text-mute)] marker:text-[var(--text-faint)]">
      {children}
    </ol>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-[var(--text)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--text)]"
    >
      {children}
    </a>
  );
}