import React, { forwardRef } from 'react';
import { TextInput } from 'react-native';

import { JobDescriptionInput } from '../JobDescriptionInput';
import { JobDescriptionSectionProps } from './types';

export const JobDescriptionSection = forwardRef<TextInput, JobDescriptionSectionProps>(
  ({ children, ...props }, ref) => {
    return (
      <JobDescriptionInput ref={ref} {...props}>
        {children}
      </JobDescriptionInput>
    );
  },
);

JobDescriptionSection.displayName = 'JobDescriptionSection';
