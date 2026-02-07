import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  // Menu button positioned consistently in bottom left corner across devices
  menuButton: {
    position: 'absolute',
    left: -380,
    bottom: -350,
    width: 900,
    height: 900,
  },
  helpButton: {
    position: 'absolute',
    left: -200,
    bottom: -305,
    width: 900,
    height: 900,
  },
  menuTogglePressable: {
    position: 'absolute',
    left: 35,
    bottom: 35,
    width: 70,
    height: 70,
    borderRadius: 70,
    backgroundColor: 'transparent',
  },
  helpTogglePressable: {
    position: 'absolute',
    right: 35,
    bottom: 35,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'transparent',
  },
  lottieAnimationLarge: {
    width: '100%',
    height: '100%',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  menuIconTextLarge: {
    fontSize: 120,
    fontWeight: 'bold',
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 998,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  menuContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginLeft: 38,
    marginBottom: 98,
  },
  helpMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  helpMenuContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginRight: 70,
    marginBottom: 125,
  },
  menuItem: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 4,
    minWidth: 200,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  helpMenuItem: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
    marginHorizontal: 24,
    minWidth: 90,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    color: 'transparent',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
});



















