import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  slider: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5DCC9',
    width: 64,
    height: 32,
    borderRadius: 16,
    position: 'relative',
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  iconWrapper: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  businessIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'left',
    lineHeight: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
    lineHeight: 19,
  },
  subtitle: {
    color: '#49454F',
    fontWeight: '400',
    fontSize: 12.5,
    lineHeight: 14,
    marginTop: 1,
  },
  pmIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  pmIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
    opacity: 0.5,
  },
  arrowIcon: {
    width: 14,
    height: 14,
    resizeMode: 'contain',
    opacity: 0.5,
  },
  editPaymentButton: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  editPaymentButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
});






