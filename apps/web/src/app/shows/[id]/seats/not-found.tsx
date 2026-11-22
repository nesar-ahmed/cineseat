import { ShowUnavailable } from '../../../../features/seats/show-unavailable';

/** Rendered (with a 404 status) when the page calls notFound() for an unknown showtime. */
export default function NotFound() {
  return <ShowUnavailable reason="missing" />;
}
