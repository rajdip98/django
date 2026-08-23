import { useEffect, useState } from 'react';

/**
 * Runs one of the api.* loaders and reports its three states: loading, live
 * data, or seed content standing in for an unreachable backend.
 */
export function useData(loader, deps = []) {
  const [state, setState] = useState({ data: null, live: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    loader().then((result) => {
      if (cancelled) return;
      setState({ data: result.data, live: result.live, loading: false });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
