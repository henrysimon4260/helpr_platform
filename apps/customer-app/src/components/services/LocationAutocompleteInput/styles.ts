import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: 'relative',
    zIndex: 100,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  clearButtonText: {
    fontSize: 18,
    color: '#7C7160',
    fontWeight: '500',
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: -42,
    right: 0,
    backgroundColor: '#E5DCC9',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 0,
    zIndex: 1000,
    marginTop: 0,
    overflow: 'hidden',
  },
  suggestion: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#cfbf9dff',
  },
  suggestionLast: {
    borderBottomWidth: 0,
  },
  suggestionCurrent: {
    backgroundColor: '#E5DCC9',
    borderBottomWidth: 0,
  },
  suggestionDisabled: {
    opacity: 0.5,
  },
  suggestionPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333333',
  },
  suggestionSecondary: {
    fontSize: 13,
    color: '#7C7160',
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#7C7160',
  },
  divider: {
    height: 1,
    backgroundColor: '#cfbf9dff',
  },
  currentLocationTextWrapper: {
    flex: 1,
  },
});
