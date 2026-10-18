import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { testConnection as apiTestConnection } from "../api/postgres";

const STORAGE_KEY = "drawdb_postgres_connection";

export const defaultPostgresConnection = {
  host: "localhost",
  port: "5432",
  user: "postgres",
  password: "",
  database: "postgres",
  ssl: false,
  schema: "public",
};

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { connection: { ...defaultPostgresConnection }, remember: false };
    }
    const parsed = JSON.parse(raw);
    return {
      connection: {
        ...defaultPostgresConnection,
        ...(parsed.connection ?? {}),
      },
      remember: Boolean(parsed.remember),
    };
  } catch {
    return { connection: { ...defaultPostgresConnection }, remember: false };
  }
}

function persist(connection, remember) {
  try {
    const toStore = remember ? connection : { ...connection, password: "" };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ connection: toStore, remember }),
    );
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
}

export const PostgresContext = createContext(null);

export default function PostgresContextProvider({ children }) {
  const stored = useMemo(loadStored, []);
  const [connection, setConnection] = useState(stored.connection);
  const [remember, setRemember] = useState(stored.remember);
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);

  useEffect(() => {
    persist(connection, remember);
  }, [connection, remember]);

  const updateConnection = useCallback((partial) => {
    setConnection((prev) => ({ ...prev, ...partial }));
  }, []);

  const test = useCallback(
    async (override) => {
      const config = override ?? connection;
      const { connectionInfo: info } = await apiTestConnection(config);
      return info;
    },
    [connection],
  );

  const connect = useCallback(
    async (override) => {
      setConnecting(true);
      setError(null);
      try {
        const config = override ?? connection;
        const { connectionInfo: info } = await apiTestConnection(config);
        if (override) setConnection((prev) => ({ ...prev, ...override }));
        setConnectionInfo(info);
        setConnected(true);
        return info;
      } catch (e) {
        setConnected(false);
        setConnectionInfo(null);
        setError(e);
        throw e;
      } finally {
        setConnecting(false);
      }
    },
    [connection],
  );

  const disconnect = useCallback(() => {
    setConnected(false);
    setConnectionInfo(null);
    setError(null);
  }, []);

  const openConnectionModal = useCallback(
    () => setConnectionModalOpen(true),
    [],
  );
  const closeConnectionModal = useCallback(
    () => setConnectionModalOpen(false),
    [],
  );

  const value = useMemo(
    () => ({
      connection,
      updateConnection,
      remember,
      setRemember,
      connected,
      connectionInfo,
      connecting,
      error,
      test,
      connect,
      disconnect,
      connectionModalOpen,
      openConnectionModal,
      closeConnectionModal,
    }),
    [
      connection,
      updateConnection,
      remember,
      connected,
      connectionInfo,
      connecting,
      error,
      test,
      connect,
      disconnect,
      connectionModalOpen,
      openConnectionModal,
      closeConnectionModal,
    ],
  );

  return (
    <PostgresContext.Provider value={value}>
      {children}
    </PostgresContext.Provider>
  );
}
