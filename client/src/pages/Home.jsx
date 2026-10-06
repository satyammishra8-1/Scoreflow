import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <section className="trust-strip">
          <div className="container trust-row">
            <span>Hackathons</span>
            <span>Project Exhibitions</span>
            <span>Colleges</span>
            <span>Institutions</span>
          </div>
        </section>
        <Features />
        <HowItWorks />
      </main>
    </>
  );
}
