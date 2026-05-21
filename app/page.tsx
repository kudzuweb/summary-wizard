// Placeholder landing page: confirms fonts, tokens, and CSS Modules are wired up.

import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        <span className={styles.accent}>Summary</span> Wizard
      </h1>
      <p className={styles.subtitle}>
        Upload a medical record to generate a clinician-facing summary,
        interactive health-history timeline, and AI-powered Q&A.
      </p>
    </div>
  );
}
