import React, { createContext, useContext, useRef, useCallback, ReactNode } from 'react';

interface ShareFunctions {
  getShareUrl: () => string;
  addParamsToUrl: () => void;
}

interface ShareContextType {
  getShareUrl: () => string;
  addParamsToUrl: () => void;
  setShareFunctions: (fns: ShareFunctions) => void;
}

const ShareContext = createContext<ShareContextType>({
  getShareUrl: () => '',
  addParamsToUrl: () => {},
  setShareFunctions: () => {},
});

export const ShareProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const shareFnsRef = useRef<ShareFunctions>({
    getShareUrl: () => '',
    addParamsToUrl: () => {},
  });

  const setShareFunctions = useCallback((fns: ShareFunctions) => {
    shareFnsRef.current = fns;
  }, []);

  const getShareUrl = useCallback(() => shareFnsRef.current.getShareUrl(), []);
  const addParamsToUrl = useCallback(() => shareFnsRef.current.addParamsToUrl(), []);

  return (
    <ShareContext.Provider value={{ getShareUrl, addParamsToUrl, setShareFunctions }}>
      {children}
    </ShareContext.Provider>
  );
};

export const useShareContext = () => useContext(ShareContext);
