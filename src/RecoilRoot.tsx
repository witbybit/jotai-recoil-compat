import { Provider } from 'jotai';
import type { ReactNode } from 'react';

export interface RecoilRootProps {
  children: ReactNode;
  initializeState?: (opts: {
    set: <T>(atom: any, value: T) => void;
    setUnvalidatedAtomValues: (values: Map<string, any>) => void;
  }) => void;
}

export function RecoilRoot({ children, initializeState }: RecoilRootProps) {
  // Jotai's Provider is equivalent to RecoilRoot
  // The main difference is that Recoil allows initialization via initializeState
  // For now, we provide a basic implementation

  if (initializeState) {
    console.warn(
      'jotai-recoil: initializeState is not fully supported yet. ' +
      'Consider initializing atoms with default values instead.'
    );
  }

  return <Provider>{children}</Provider>;
}
