import * as Decoder from 'schemawax';
import {asyncSuccess, asyncTryCatch, type AsyncResult} from '../lib/asyncResult';

export type Config = {
  version: string
  serviceUrl: string
}

const configDecoder = Decoder.object({
  required: {
    version: Decoder.string,
    serviceUrl: Decoder.string,
  },
});

const DEFAULT_CONFIG: Config = {
  version: 'dev',
  serviceUrl: 'http://localhost:8080',
};

export const loadConfig = (url = `${import.meta.env.BASE_URL}config.json`): AsyncResult<Config, never> =>
  asyncTryCatch(() => fetch(url))
    .andThen(response => response.ok
      ? asyncTryCatch(() => response.json() as Promise<unknown>).map(json => configDecoder.decode(json) ?? DEFAULT_CONFIG)
      : asyncSuccess<Config, Error>(DEFAULT_CONFIG))
    .or(() => asyncSuccess(DEFAULT_CONFIG));
