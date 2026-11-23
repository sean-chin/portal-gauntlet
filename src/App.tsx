import { useEffect, useState } from 'react';
import { parseRoute, runHref } from './route';
import { Bench } from './ui/Bench';
import { Landing } from './ui/Landing';

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const route = parseRoute(hash);
  if (route.page === 'home') return <Landing />;
  return <Bench key={runHref(route)} route={route} />;
}
