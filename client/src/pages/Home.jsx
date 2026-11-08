import { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import AboutUs from '../components/AboutUs';
import Footer from '../components/Footer';

const metrics = [
  { label: 'Competitions', value: '18+' },
  { label: 'Judges', value: '142' },
  { label: 'Teams', value: '96%' },
];

export default function Home() {
  const mainRef = useRef(null);

  useEffect(() => {
    const main = mainRef.current;
    const targets = main?.querySelectorAll('.scroll-reveal');
    if (!main || !targets?.length) return undefined;

    if (!('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });

    targets.forEach((target) => observer.observe(target));
    main.classList.add('scroll-ready');

    return () => {
      observer.disconnect();
      main.classList.remove('scroll-ready');
    };
  }, []);

  return (
    <>
      <Navbar />
      <main ref={mainRef} className="home-main">
        <Hero />
        <section className="trust-strip" aria-label="ScoreFlow community metrics">
          <div className="container trust-row">
            <p className="trust-intro scroll-reveal">A clearer way to run every competition</p>
            {metrics.map((metric) => (
              <div className="trust-metric scroll-reveal" key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </section>
        <Features />
        <HowItWorks />
        <AboutUs />
      </main>
      <Footer />
    </>
  );
}
