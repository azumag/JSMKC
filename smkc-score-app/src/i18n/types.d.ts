import messages from '../../messages/en.json';
import broadcast from '../../messages/broadcast/en.json';
import debugFill from '../../messages/debug-fill/en.json';
import gpCupAssignment from '../../messages/gp-cup-assignment/en.json';
import loadingOverlay from '../../messages/loading-overlay/en.json';
import loadingSkeleton from '../../messages/loading-skeleton/en.json';
import loadingSpinner from '../../messages/loading-spinner/en.json';
import localeSwitcher from '../../messages/locale-switcher/en.json';
import matchValidation from '../../messages/match-validation/en.json';
import modePublishSwitch from '../../messages/mode-publish-switch/en.json';
import rankCell from '../../messages/rank-cell/en.json';
import taPromotion from '../../messages/ta-promotion/en.json';
import tournamentLayout from '../../messages/tournament-layout/en.json';
import updateIndicator from '../../messages/update-indicator/en.json';

/**
 * Compile-time mirror of the catalog assembled by request.ts.
 *
 * Keep this list in sync with loadMessages(): next-intl validates namespace/key
 * usage against AppConfig.Messages during next build, while the runtime loader
 * composes several smaller catalogs on top of messages/en.json.
 */
type Messages = Omit<typeof messages, 'match' | 'ta'> & {
  broadcast: typeof broadcast;
  debugFill: typeof debugFill;
  gpCupAssignment: typeof gpCupAssignment &
    Pick<typeof messages.finals, 'cupDetailsResolution' | 'keepCupDetails' | 'clearCupDetails' | 'cancelCupChange'>;
  loadingOverlay: typeof loadingOverlay;
  loadingSkeleton: typeof loadingSkeleton;
  loadingSpinner: typeof loadingSpinner;
  localeSwitcher: typeof localeSwitcher;
  modePublishSwitch: typeof modePublishSwitch;
  rankCell: typeof rankCell;
  tournamentLayout: typeof tournamentLayout;
  updateIndicator: typeof updateIndicator;
  match: typeof messages.match & typeof matchValidation;
  ta: typeof messages.ta & typeof taPromotion;
};

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
