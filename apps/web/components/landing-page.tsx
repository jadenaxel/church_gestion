'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarHeart, CalendarRange, Check, ChevronRight, ClipboardCheck, ExternalLink, Layers3, UsersRound } from 'lucide-react';
import { useExperience } from './experience-provider';
import { maintainRouteTitle } from './route-title';
import { localeDetails, supportedLocales } from '@/lib/i18n';
import styles from './landing-page.module.css';

const features = [
  { icon: CalendarRange, title: 'Un calendario compartido', description: 'Propón fechas, detecta coincidencias y lleva las decisiones a revisión antes de publicar.' },
  { icon: UsersRound, title: 'Un espacio para cada ministerio', description: 'Equipos, programas, documentos y presupuestos conectados al trabajo de tu iglesia.' },
  { icon: ClipboardCheck, title: 'Seguimiento que da claridad', description: 'Tareas, avances, reportes y alertas para saber qué sigue y qué necesita atención.' },
];

const steps = [
  { icon: CalendarRange, title: 'Planifica', description: 'Define actividades y responsables.' },
  { icon: UsersRound, title: 'Coordina', description: 'Revisa fechas y acuerdos.' },
  { icon: ClipboardCheck, title: 'Da seguimiento', description: 'Acompaña el avance de cada programa.' },
];

export function LandingPage() {
  const { locale, setLocale, tr } = useExperience();
  const title = tr('GestionChurch · Coordinación con propósito');
  useEffect(() => maintainRouteTitle(title), [title]);

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label={tr('GestionChurch · Página principal')}>
        <span className={styles.brandMark}><CalendarHeart size={27} strokeWidth={1.7} aria-hidden="true" /></span>
        <span className={styles.brandName}><span><strong>Gestion</strong>Church</span><small>{tr('coordinación con propósito')}</small></span>
      </Link>
      <nav className={styles.headerActions} aria-label={tr('Navegación principal')}>
        <a href="#funcionalidades" className={styles.exploreNav}>{tr('Funcionalidades')}</a>
        <fieldset className={styles.languages}>
          <legend className="sr-only">{tr('Idioma de la aplicación')}</legend>
          {supportedLocales.map((language) => <button key={language} type="button" aria-pressed={locale === language} lang={language} aria-label={localeDetails[language].nativeLabel} title={localeDetails[language].nativeLabel} onClick={() => setLocale(language)}>{language.toUpperCase()}</button>)}
        </fieldset>
        <Link href="/login" prefetch={false} className={styles.headerLogin}>{tr('Ingresar')}<ArrowRight size={17} aria-hidden="true" /></Link>
      </nav>
    </header>

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" />{tr('Una iglesia. Un mismo propósito.')}</p>
          <h1 id="landing-title">{tr('Más orden.')}<br /><em>{tr('Más tiempo para la misión.')}</em></h1>
          <p className={styles.lead}>{tr('Conecta a tus departamentos, organiza el calendario y acompaña cada programa desde un solo lugar.')}</p>
          <div className={styles.heroActions}>
            <Link href="/login" prefetch={false} className={styles.primaryButton}>{tr('Ingresar a mi iglesia')}<ArrowRight size={20} aria-hidden="true" /></Link>
            <a href="#funcionalidades" className={styles.secondaryButton}>{tr('Explorar funcionalidades')}<ChevronRight size={18} aria-hidden="true" /></a>
          </div>
          <p className={styles.heroNote}><Check size={17} aria-hidden="true" />{tr('Cada iglesia, su propio espacio')}</p>
        </div>

        <div className={styles.workflow}>
          <div className={styles.workflowHeading}>
            <span className={styles.workflowMark}><Layers3 size={23} strokeWidth={1.6} aria-hidden="true" /></span>
            <div><p className={styles.workflowEyebrow}>{tr('Una iglesia · un calendario')}</p><h2>{tr('Del plan a la acción')}</h2></div>
          </div>
          <ol className={styles.steps}>
            {steps.map(({ icon: Icon, title: stepTitle, description }, index) => <li key={stepTitle}>
              <span className={styles.stepIcon}><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
              <div><h3>{tr(stepTitle)}</h3><p>{tr(description)}</p></div>
              <span className={styles.stepNumber} aria-hidden="true">0{index + 1}</span>
            </li>)}
          </ol>
          <div className={styles.workflowFooter}><span aria-hidden="true" />{tr('Departamentos conectados, decisiones claras.')}</div>
        </div>
      </section>

      <section id="funcionalidades" className={styles.features} aria-labelledby="features-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>{tr('Coordinación con propósito')}</p><h2 id="features-title">{tr('Todo conectado. Todo con propósito.')}</h2><p>{tr('Planificación, colaboración y seguimiento para servir con claridad.')}</p></div>
        <div className={styles.featureGrid}>
          {features.map(({ icon: Icon, title: featureTitle, description }) => <article key={featureTitle} className={styles.featureCard}>
            <span className={styles.featureIcon}><Icon size={25} strokeWidth={1.6} aria-hidden="true" /></span><h3>{tr(featureTitle)}</h3><p>{tr(description)}</p>
          </article>)}
        </div>
      </section>

      <section className={styles.purpose} aria-labelledby="purpose-title">
        <div><p className={styles.eyebrow}>{tr('Al servicio de la misión')}</p><h2 id="purpose-title">{tr('Organizar también es cuidar.')}</h2><blockquote>{tr('“Pero hágase todo decentemente y con orden.” · 1 Corintios 14:40')}</blockquote></div>
        <Link href="/login" prefetch={false} className={styles.purposeButton}>{tr('Ingresar a mi iglesia')}<ArrowRight size={20} aria-hidden="true" /></Link>
      </section>
    </main>

    <footer className={styles.footer}>
      <span className={styles.footerBrand}>GestionChurch<span aria-hidden="true"> · </span><span>{tr('coordinación con propósito')}</span></span>
      <span className={styles.credit}>{tr('Desarrollado por')} <a href="https://idaraglobaltechnologies.com/" target="_blank" rel="noopener noreferrer" aria-label={tr('Idara Global Technologies (abre en una nueva pestaña)')}>Idara Global Technologies<ExternalLink size={15} aria-hidden="true" /></a></span>
    </footer>
  </div>;
}
