import * as React from 'react';
import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';

const DatabaseContext = React.createContext<
  React.MutableRefObject<QuickSQLiteConnection | null> | undefined
>(undefined);

export function DatabaseProvider({
  children,
}: React.PropsWithChildren<object>) {
  const ref = React.useRef<QuickSQLiteConnection | null>(null);
  // React.useEffect(() => {
  //   // Implicitly searches bundle directory (due to patch-package)
  //   const db = open({ name: 'jmdict.sqlite3' });
  //   ref.current = db;
  //   console.log('opened db', db);

  //   return () => {
  //     db.close();
  //     ref.current = null;
  //     console.log('closed db', db);
  //   };
  // }, []);

  return (
    <DatabaseContext.Provider value={ref}>{children}</DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = React.useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
