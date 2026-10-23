
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/shared/lib/format";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Runs `fn` on mount and whenever `deps` change. `reload()` refetches without a loading flash. */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fnRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((err) => alive && setState((s) => ({ ...s, error: errorMessage(err), loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (updater: (prev: T | null) => T | null) =>
      setState((s) => ({ ...s, data: updater(s.data) })),
    []
  );
  return { ...state, reload, setData };
}
