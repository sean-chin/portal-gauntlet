import { useEffect, useState } from 'react';
import { parseRoute, runHref } from './route';
import { Bench } from './ui/Bench';
import { Landing } from './ui/Landing';
import { Replay } from './ui/Replay';
import { Report } from './ui/Report';

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const route = parseRoute(hash);
  if (route.page === 'home') return <Landing />;
  if (route.page === 'replay') return <Replay key={hash} route={route} />;
  if (route.page === 'report') return <Report />;
  return <Bench key={runHref(route)} route={route} />;
}
