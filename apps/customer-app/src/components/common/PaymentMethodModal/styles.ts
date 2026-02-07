import { Platform, StyleSheet } from 'react-native';

export const cardFieldStyle = {
  backgroundColor: '#FFFFFF',
  textColor: '#333333',
  placeholderColor: '#999999',
  borderRadius: 12,
  fontSize: 16,
};

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFF8E8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4309',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
  closeText: {
    fontSize: 18,
    color: '#49454F',
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  plaidOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5DCC9',
  },
  plaidContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plaidLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  plaidTextContainer: {
    flex: 1,
  },
  plaidTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  plaidSubtitle: {
    fontSize: 13,
    color: '#0c4309',
    marginTop: 2,
  },
  plaidArrow: {
    fontSize: 20,
    color: '#49454F',
  },
  cardFieldContainer: {
    marginBottom: 20,
  },
  cardField: {
    width: '100%',
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  actions: {
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#0c4309',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#FFFFFF',
  },
  methodsList: {
    gap: 12,
    marginBottom: 16,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5DCC9',
  },
  methodItemSelected: {
    borderColor: '#0c4309',
    borderWidth: 2,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodIconWrapper: {
    width: 40,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodIcon: {
    width: 32,
    height: 24,
  },
  methodBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodBrand: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
  },
  defaultBadge: {
    backgroundColor: '#0c4309',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  methodDetails: {
    fontSize: 13,
    color: '#49454F',
    marginTop: 2,
  },
  methodSelectedIcon: {
    color: '#0c4309',
    fontSize: 18,
    fontWeight: '700',
  },
  checkmarkIcon: {
    color: '#0c4309',
    fontSize: 20,
    fontWeight: '700',
  },
  addNewButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  addNewButtonText: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  overlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultPromptModal: {
    width: '70%',
    backgroundColor: '#FFF8E8',
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  defaultPromptTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  defaultPromptDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#CAC4D0',
    marginBottom: 10,
    marginHorizontal: -30,
  },
  defaultPromptMessage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  defaultPromptActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  defaultPromptButton: {
    backgroundColor: '#E5DCC9',
    borderRadius: 30,
    paddingVertical: 5,
    paddingHorizontal: 20,
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginHorizontal: 5,
  },
  defaultPromptButtonText: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  defaultPromptPrimaryButton: {
    backgroundColor: '#0c4309',
  },
  defaultPromptPrimaryButtonText: {
    color: '#FFFFFF',
  },
});

