import { Cinemas } from '../features/landing/cinemas';
import { Faq } from '../features/landing/faq';
import { HeroBillboard } from '../features/landing/hero-billboard';
import { MembershipCta } from '../features/landing/membership-cta';
import { MovieRails } from '../features/landing/movie-rails';
import { Offers } from '../features/landing/offers';
import { QuickBooking } from '../features/landing/quick-booking';
import { SeatExperience } from '../features/landing/seat-experience';

/**
 * Home: a cinematic billboard, booking in one row, then what's on, the offers,
 * how seats work, the cinemas, and the answers people look for before paying.
 */
export default function HomePage() {
  return (
    <>
      <HeroBillboard />
      <QuickBooking />
      <MovieRails />
      <Offers />
      <SeatExperience />
      <Cinemas />
      <Faq />
      <MembershipCta />
    </>
  );
}
