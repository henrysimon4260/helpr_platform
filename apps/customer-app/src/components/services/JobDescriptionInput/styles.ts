import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useJobDescriptionInputStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      marginTop: 5,
      marginBottom: 5,
      height: 135,
      borderColor: '#00000019',
      borderWidth: 1,
    },
    input: {
      color: '#333333',
      fontSize: 17,
      textAlign: 'left',
      textAlignVertical: 'top',
      paddingLeft: 16,
      paddingRight: 20,
      paddingBottom: 24,
      paddingTop: 12,
      maxHeight: 75,
    },
  });
};






