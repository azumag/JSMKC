import messages from '../../messages/en.json';

type Messages = typeof messages;
type LegacyDynamicNamespace = 'auth' | 'common' | 'participant' | 'ta';
type TypedMessages = Omit<Messages, LegacyDynamicNamespace> & {
  [Namespace in LegacyDynamicNamespace]: Messages[Namespace] & Record<string, string>;
};

declare module 'use-intl' {
  interface AppConfig {
    /**
     * Keep namespaces with intentionally dynamic keys compatible while making
     * every other namespace (including taFinals/taElimination) key-safe.
     */
    Messages: TypedMessages;
  }
}
