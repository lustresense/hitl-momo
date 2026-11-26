export { CoverScreen, type CoverCompleteResult, type CoverScreenProps } from "./CoverScreen";
export {
  COVER_PHASES,
  coverReducer,
  createInitialCoverState,
  isBookVisiblePhase,
  isNuiActivePhase,
  type CoverAction,
  type CoverCameraStatus,
  type CoverMachineState,
  type CoverPhase,
  type CreateInitialCoverOptions,
  type GateNudge,
  type GateState,
} from "./cover-machine";
export {
  clampCover,
  computeCoverLayout,
  computeFocusPose,
  computeGatePlacement,
  computeNameParkingPose,
  computeSpiralCount,
  type CoverLayout,
  type CoverPose,
  type GatePlacement,
} from "./cover-layout";
export {
  clipPolygon,
  computeCurlFrame,
  smoothStep,
  type CurlFrameGeometry,
  type CurlGradientCoords,
  type CurlPoint,
} from "./book-curl-math";
export { CameraConsentGate, type CameraConsentGateProps } from "./CameraConsentGate";
export { CoverCameraCard, type CoverCameraCardProps, type CoverCameraDevice } from "./CoverCameraCard";
export { CoverBrandLogo, CoverDoodles, CoverHero, CoverSpiralBinding } from "./CoverDecorations";
export { AyoRing, type AyoRingProps } from "./AyoRing";
export { BookCurlTransition, type BookCurlHandle, type BookCurlTransitionProps } from "./BookCurlTransition";
export {
  applyCoverDomLayout,
  positionInsideBubble,
  setMomoCenterPose,
  useCoverTimelineRefs,
} from "./cover-dom-layout";
export { useCoverCamera, type CoverScreenCameraState, type UseCoverCameraOptions } from "./useCoverCamera";
export { useCoverTimeline, type CoverTimelineRefs, type CoverTimelineState, type UseCoverTimelineOptions } from "./useCoverTimeline";
export { NameStep, type NameStepProps } from "./name/NameStep";
export { NameConfirm, type NameConfirmProps } from "./name/NameConfirm";
export { normalizeName } from "./name/normalize-name";
export {
  createDefaultNameProviders,
  listenWithFallback,
  type DefaultNameProvidersOptions,
  type ListenFallbackCallbacks,
  type NameOutcome,
  type NameProvider,
  type NameProviderKind,
  type NameResult,
} from "./name/name-provider";
export { createSttLabProvider } from "./name/providers/stt-lab";
export { createTypedNameProvider, type TypedNameProvider } from "./name/providers/typed";
export { createSimNameProvider, SIM_SAMPLE_NAME, type SimNameProviderOptions } from "./name/providers/sim";
export {
  NotSupportedError,
  getActiveJoinStrategy,
  nameOnly,
  rulerPlusName,
  type JoinIdentityContext,
  type JoinIdentityStrategy,
} from "./join/join-identity";
