import React from 'react';
import { ScrollText } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">{title}</h2>
    <div className="text-slate-600 dark:text-slate-400 leading-relaxed space-y-3">{children}</div>
  </section>
);

export const TermsOfService: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl mb-6">
          <ScrollText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">
          Terms of Use
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Last updated 4 July 2026</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-lg shadow-slate-200/50 dark:shadow-black/30 border border-slate-200 dark:border-slate-700 p-6 md:p-10">
        <Section title="What this site is">
          <p>
            UK Immigration Compass is a free, non-profit information tool covering UK
            sponsor licensing, immigration-related petitions, and immigration news. There is
            no charge to use it, no account required, and nothing to buy. By using the site,
            you agree to these terms.
          </p>
        </Section>

        <Section title="Not legal advice">
          <p>
            Nothing on this site is legal advice, and using it does not create any advisor or
            representative relationship. The letter simplifier uses AI to rewrite text in
            plain English and can get things wrong. Sponsor status, petition figures, and news
            summaries are provided for general information only. Always confirm anything that
            matters to your case, application, or visa directly with the GOV.UK website, UK
            Parliament, or a qualified immigration solicitor before relying on it.
          </p>
        </Section>

        <Section title="Accuracy of information">
          <p>
            We pull sponsor data from the official GOV.UK register and petition data from UK
            Parliament's official API, refreshed automatically on a regular schedule. Even so,
            official registers change, our refresh can lag behind the source by up to a day,
            and errors are possible. We make no guarantee that any information on this site is
            complete, current, or error-free at the moment you view it.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Attempt to disrupt, overload, or scrape the site at a scale beyond normal personal use</li>
            <li>Use the site for any unlawful purpose</li>
            <li>Attempt to bypass rate limits or security controls</li>
          </ul>
        </Section>

        <Section title="No warranty, limitation of liability">
          <p>
            This site is provided "as is," with no warranty of any kind, express or implied.
            To the fullest extent permitted by law, we are not liable for any loss or damage
            arising from your use of, or reliance on, this site, including decisions made about
            employment, sponsorship, or immigration status based on information found here.
          </p>
        </Section>

        <Section title="External links">
          <p>
            The site links to official third-party resources such as GOV.UK and UK Parliament.
            We don't control those sites and aren't responsible for their content or
            availability.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            These terms may be updated from time to time. Changes will be posted here with a
            new "last updated" date. Continued use after a change means you accept the update.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms can be sent to{' '}
            <a href="mailto:developerworld.net@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">
              developerworld.net@gmail.com
            </a>.
          </p>
        </Section>
      </div>
    </div>
  );
};
