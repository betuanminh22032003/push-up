import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loadChallenges, saveChallenge } from '../storage/records';

const ChallengesContext = createContext(null);

/**
 * The local list of challenges sent and received (src/challenge/challenge.js
 * `challengeRecord`), newest first. Nothing about them leaves the phone but
 * the links the user shares.
 */
export function ChallengesProvider({ children }) {
  const [records, setRecords] = useState([]);

  const reload = useCallback(async () => {
    setRecords(await loadChallenges());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addRecord = useCallback(async (record) => {
    setRecords(await saveChallenge(record));
  }, []);

  const value = useMemo(() => ({ records, addRecord, reload }), [records, addRecord, reload]);
  return <ChallengesContext.Provider value={value}>{children}</ChallengesContext.Provider>;
}

export function useChallenges() {
  const ctx = useContext(ChallengesContext);
  if (!ctx) throw new Error('useChallenges must be used inside ChallengesProvider');
  return ctx;
}
