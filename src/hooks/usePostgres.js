import { useContext } from "react";
import { PostgresContext } from "../context/PostgresContext";

export default function usePostgres() {
  return useContext(PostgresContext);
}
