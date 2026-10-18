import LayoutContextProvider from "../context/LayoutContext";
import TransformContextProvider from "../context/TransformContext";
import TablesContextProvider from "../context/DiagramContext";
import UndoRedoContextProvider from "../context/UndoRedoContext";
import SelectContextProvider from "../context/SelectContext";
import AreasContextProvider from "../context/AreasContext";
import NotesContextProvider from "../context/NotesContext";
import TypesContextProvider from "../context/TypesContext";
import SettingsContextProvider from "../context/SettingsContext";
import SaveStateContextProvider from "../context/SaveStateContext";
import EnumsContextProvider from "../context/EnumsContext";
import ViewsContextProvider from "../context/ViewsContext";
import PostgresContextProvider from "../context/PostgresContext";
import { ModalContextProvider } from "../context/ModalContext";
import WorkSpace from "../components/Workspace";
import { useThemedPage } from "../hooks";

export default function Editor() {
  useThemedPage();

  return (
    <SettingsContextProvider>
      <ModalContextProvider>
        <LayoutContextProvider>
          <TransformContextProvider>
            <UndoRedoContextProvider>
              <SelectContextProvider>
                <AreasContextProvider>
                  <NotesContextProvider>
                    <TypesContextProvider>
                      <EnumsContextProvider>
                        <ViewsContextProvider>
                          <PostgresContextProvider>
                            <TablesContextProvider>
                              <SaveStateContextProvider>
                                <WorkSpace />
                              </SaveStateContextProvider>
                            </TablesContextProvider>
                          </PostgresContextProvider>
                        </ViewsContextProvider>
                      </EnumsContextProvider>
                    </TypesContextProvider>
                  </NotesContextProvider>
                </AreasContextProvider>
              </SelectContextProvider>
            </UndoRedoContextProvider>
          </TransformContextProvider>
        </LayoutContextProvider>
      </ModalContextProvider>
    </SettingsContextProvider>
  );
}
