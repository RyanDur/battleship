import {useEffect, useState} from 'react';
import {App} from './App';
import {loadConfig, type Config} from './protocol/config';

export const AppShell = () => {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    loadConfig().onSuccess(setConfig);
  }, []);

  if (!config) return <p className="app-loading">Loading…</p>;

  return <App config={config}/>;
};
