import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return to dashboard</Link>
    </main>
  );
}
