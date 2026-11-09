import { CallToAction } from '../features/landing/call-to-action';
import { Hero } from '../features/landing/hero';
import { HowItWorks } from '../features/landing/how-it-works';
import { NowShowing } from '../features/landing/now-showing';
import { RulesBand } from '../features/landing/rules-band';
import { UnderTheHood } from '../features/landing/under-the-hood';
import { Venues } from '../features/landing/venues';
import { WhySeats } from '../features/landing/why-seats';

export default function HomePage() {
  return (
    <>
      <Hero />
      <RulesBand />
      <NowShowing />
      <WhySeats />
      <HowItWorks />
      <UnderTheHood />
      <Venues />
      <CallToAction />
    </>
  );
}
