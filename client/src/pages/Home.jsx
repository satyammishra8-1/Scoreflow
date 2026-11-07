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
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <section className="trust-strip" aria-label="ScoreFlow community metrics">
          <div className="container trust-row">
            {metrics.map((metric) => (
              <div className="trust-metric" key={metric.label}>
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
