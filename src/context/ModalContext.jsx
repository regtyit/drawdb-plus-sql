import { createContext, useContext, useMemo, useState } from "react";
import { MODAL } from "../data/constants";

const ModalContext = createContext({ modal: MODAL.NONE, setModal: () => {} });

export function ModalContextProvider({ children }) {
  const [modal, setModal] = useState(MODAL.NONE);
  const value = useMemo(() => ({ modal, setModal }), [modal]);
  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
}

export default function useModal() {
  return useContext(ModalContext);
}
