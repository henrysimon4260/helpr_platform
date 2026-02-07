import React, { forwardRef } from 'react';
import { TextInput, View } from 'react-native';

import { useJobDescriptionInputStyles } from './styles';
import { JobDescriptionInputProps } from './types';

export const JobDescriptionInput = forwardRef<TextInput, JobDescriptionInputProps>(
  (
    {
      value,
      onChangeText,
      onFocus,
      onBlur,
      onSubmitEditing,
      placeholder = 'Describe your task...',
      editable = true,
      selection,
      onSelectionChange,
      children,
    },
    ref
  ) => {
    const styles = useJobDescriptionInputStyles();

    return (
      <View style={styles.container}>
        <TextInput
          ref={ref}
          style={styles.input}
          placeholder={placeholder}
          multiline
          numberOfLines={3}
          scrollEnabled={true}
          placeholderTextColor="#333333ab"
          value={value}
          selection={selection}
          onSelectionChange={onSelectionChange}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit
          returnKeyType="done"
          editable={editable}
        />
        {children}
      </View>
    );
  }
);

JobDescriptionInput.displayName = 'JobDescriptionInput';






