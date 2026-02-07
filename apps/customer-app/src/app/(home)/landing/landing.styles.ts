import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  fadeContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    paddingTop: 100,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 48,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
});



















