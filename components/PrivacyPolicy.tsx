import React from 'react';
import { ShieldCheck } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold text-slate-900 mb-3">{title}</h2>
    <div className="text-slate-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-6">
          <ShieldCheck className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
          Privacy Policy
        </h1>
        <p className="text-slate-500">Last updated 4 July 2026</p>
      </div>

      <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6 md:p-10">
        <Section title="The short version">
          <p>
            UK Immigration Compass is a free, non-profit information tool. There is no account
            to create, no login, and we do not collect names, emails, or any personal profile
            of visitors. We do not sell data, because we do not have any to sell.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            <strong>Anonymous usage analytics.</strong> We use Vercel Web Analytics to see
            aggregate traffic, such as how many people visited and which pages are popular.
            It does not use cookies and does not track you individually across sites.
          </p>
          <p>
            <strong>IP address, briefly, for abuse prevention.</strong> When you use the sponsor
            checker or the letter simplifier, your IP address is used for a few seconds to
            enforce a rate limit (a cap on how many requests one visitor can make per minute),
            so the service stays available and isn't abused. It is not stored against your
            identity, not logged for tracking, and not used for anything else.
          </p>
          <p>
            <strong>Text you submit to the simplifier tool.</strong> If you paste a letter or
            document into the "Legal Jargon Buster," that text is sent to an AI provider to
            generate a plain English summary. It is processed to produce your result and is
            not stored by us afterwards. Avoid pasting anything you consider sensitive, such
            as a full name, case reference number, or address, if you'd rather not send it to
            a third-party AI service at all.
          </p>
        </Section>

        <Section title="What we don't do">
          <ul className="list-disc pl-5 space-y-2">
            <li>No account creation, passwords, or user profiles</li>
            <li>No cookies used for tracking or advertising</li>
            <li>No selling or sharing of personal data, because none is collected</li>
            <li>No ads on the site</li>
          </ul>
        </Section>

        <Section title="Data sources">
          <p>
            Sponsor licence information comes from the official GOV.UK register of licensed
            sponsors. Petition data comes from UK Parliament's official petitions API. Both are
            public datasets, refreshed automatically; we don't add any personal data from
            visitors into these sources.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes, the update will be posted here with a new "last updated"
            date. Continued use of the site after a change means you accept the update.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            If you have any questions about privacy on this site, reach out at{' '}
            <a href="mailto:developerworld.net@gmail.com" className="text-blue-600 hover:underline">
              developerworld.net@gmail.com
            </a>.
          </p>
        </Section>
      </div>
    </div>
  );
};
