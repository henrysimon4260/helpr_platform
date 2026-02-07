import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c4309',
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  containerDisabled: {
    opacity: 0.5,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  bottomRowContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
    marginTop: 0,
    marginHorizontal: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
});






