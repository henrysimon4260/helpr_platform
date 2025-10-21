# ServiceDetails Animation System

## Overview
Completely rebuilt the Lottie animation system for ServiceDetails screens in both customer and service provider apps to ensure animations are always in sync with job status and properly isolated per service.

## Problem
- Animations were jumping to wrong frames when navigating from landing cards
- Animation state was bleeding between different services
- Status updates weren't reliably triggering animation transitions
- Component remounts were causing state loss

## Solution Architecture

### Core Components

#### 1. **Per-Service State Tracking**
```typescript
const currentServiceIdRef = useRef<string | null>(null);
const currentStatusRef = useRef<string | null>(null);
const isAnimatingRef = useRef(false);
```
- `currentServiceIdRef`: Tracks which service we're currently viewing
- `currentStatusRef`: Tracks the last known status for animation purposes
- `isAnimatingRef`: Prevents animation conflicts during playback

#### 2. **Smart Service Detection**
```typescript
const isNewService = currentServiceIdRef.current !== serviceId;
const statusChanged = currentStatusRef.current !== normalizedStatus;
```
- Detects when user navigates to a different service
- Detects when the current service's status updates

#### 3. **Three Animation Paths**

##### Path A: New Service (Navigation from Landing)
```typescript
if (isNewService) {
  setTimeout(() => {
    setFrameImmediate(targetFrame);
    currentServiceIdRef.current = serviceId;
    currentStatusRef.current = normalizedStatus;
  }, 50);
  return;
}
```
- **Behavior**: Immediately jumps to correct frame
- **When**: User opens ServiceDetails from a card
- **Why**: No animation needed - just show current state
- **Delay**: 50ms ensures Lottie component is mounted

##### Path B: Same Status (Re-render)
```typescript
if (!statusChanged) {
  setFrameImmediate(targetFrame);
  return;
}
```
- **Behavior**: Ensures frame matches status
- **When**: Component re-renders with same status
- **Why**: Prevents drift, maintains accuracy

##### Path C: Status Changed (Real-time Update)
```typescript
const currentFrame = getAnimationFrame(currentStatusRef.current || '');
requestAnimationFrame(() => {
  animateToFrame(currentFrame, targetFrame);
  currentStatusRef.current = normalizedStatus;
});
```
- **Behavior**: Smooth animation from old status to new
- **When**: Service status updates (e.g., confirmed → helpr_otw)
- **Why**: Provides visual feedback for state transitions

#### 4. **Frame Setting Methods**

##### Immediate Frame Setting (No Animation)
```typescript
const setFrameImmediate = (frame: number) => {
  const lottieInstance = animationRef.current as unknown as { 
    goToAndStop?(position: number, isFrame: boolean): void;
    pause(): void;
  };
  
  lottieInstance.pause();
  if (typeof lottieInstance.goToAndStop === 'function') {
    lottieInstance.goToAndStop(frame, true);
  } else {
    animationRef.current.play(frame, frame);
  }
};
```
- Uses `goToAndStop` when available (most reliable)
- Falls back to `play(frame, frame)` if needed
- Always pauses first to prevent conflicts

##### Animated Transition
```typescript
const animateToFrame = (startFrame: number, endFrame: number) => {
  if (startFrame >= endFrame) {
    setFrameImmediate(endFrame);
    return;
  }
  
  isAnimatingRef.current = true;
  animationRef.current.play(startFrame, endFrame);
  
  const duration = ((endFrame - startFrame) / 0.7) * 16.67;
  setTimeout(() => {
    isAnimatingRef.current = false;
  }, duration);
};
```
- Only animates forward (backwards jumps are instant)
- Tracks animation state to prevent conflicts
- Calculates duration based on frame distance

#### 5. **Component Keying**
```tsx
<LottieView
  key={service?.service_id ?? 'service-animation'}
  ref={animationRef}
  autoPlay={false}
  loop={false}
  speed={0.7}
/>
```
- Keys component by service ID
- Forces remount when service changes
- Ensures clean slate for each service

#### 6. **Cleanup on Unmount**
```typescript
useEffect(() => {
  return () => {
    currentServiceIdRef.current = null;
    currentStatusRef.current = null;
    isAnimatingRef.current = false;
  };
}, [service?.service_id]);
```
- Clears refs when service changes
- Prevents stale state issues

## Status → Frame Mapping
```typescript
const getAnimationFrame = (status: string | null | undefined) => {
  const normalized = (status ?? '').toLowerCase();
  switch (normalized) {
    case 'confirmed':     return 0;   // Job confirmed, waiting
    case 'helpr_otw':     return 20;  // Provider on the way
    case 'in_progress':   return 50;  // Work in progress
    case 'completed':     return 70;  // Job finished
    default:              return 0;
  }
};
```

## How It Works: Real-World Scenarios

### Scenario 1: Opening from Landing
```
User Action: Tap service card → Navigate to ServiceDetails
Flow:
1. Component mounts with service data
2. Animation effect detects isNewService = true
3. Waits 50ms for Lottie to mount
4. Calls setFrameImmediate(targetFrame)
5. Animation shows correct status instantly
```

### Scenario 2: Status Update via Supabase
```
User Action: Provider taps "On The Way" button
Flow:
1. Status updates in database: confirmed → helpr_otw
2. Real-time subscription triggers fetchServiceData()
3. Component re-renders with new status
4. Animation effect detects statusChanged = true
5. Calls animateToFrame(0, 20)
6. Smooth animation plays from confirmed to on-the-way
```

### Scenario 3: Navigating Between Services
```
User Action: Back to landing → Tap different service card
Flow:
1. ServiceDetails unmounts
2. Cleanup effect clears all refs
3. New ServiceDetails mounts with different serviceId
4. Animation effect detects isNewService = true
5. Fresh animation at correct frame for new service
```

### Scenario 4: Component Re-render (Same Service)
```
User Action: None (React re-render)
Flow:
1. Component re-renders with same service/status
2. Animation effect detects statusChanged = false
3. Calls setFrameImmediate(targetFrame)
4. Ensures animation stays at correct frame
```

## Debugging

### Console Logs
The system includes comprehensive logging:
```
🎬 Animation effect: { serviceId, status, isNewService, statusChanged, targetFrame }
✨ New service detected, jumping to frame: X
🔄 Same status, ensuring correct frame: X
▶️ Status changed, animating from X to Y
🧹 Cleaning up animation state
```

### Common Issues & Solutions

**Issue**: Animation jumps on navigation
- **Cause**: isNewService not triggering correctly
- **Fix**: Check currentServiceIdRef updates

**Issue**: Animation doesn't update with status
- **Cause**: statusChanged not detecting difference
- **Fix**: Verify currentStatusRef is being updated

**Issue**: Animation plays when it shouldn't
- **Cause**: isAnimatingRef not preventing conflicts
- **Fix**: Check timeout duration calculation

## Files Modified
- `/apps/serviceprovider-app/app/ServiceDetails.tsx`
- `/apps/customer-app/app/ServiceDetails.tsx`

## Testing Checklist
- ✅ Open service from landing → Animation at correct frame
- ✅ Update status via button → Smooth animation
- ✅ Switch between services → Each shows correct frame
- ✅ Real-time updates → Animation responds
- ✅ App restart → Animation loads at correct frame
- ✅ Multiple rapid status changes → No jumps or conflicts

## Technical Notes

### Why goToAndStop?
- More reliable than `play(frame, frame)` for instant positioning
- Native Lottie method designed for this purpose
- Fallback ensures compatibility

### Why 50ms delay?
- Ensures Lottie component is fully mounted
- Prevents "ref not ready" errors
- Small enough to be imperceptible

### Why separate refs instead of state?
- No re-renders needed for tracking
- Prevents effect dependency cycles
- More predictable behavior

### Why key by service ID?
- Forces component remount on service change
- Clears all internal Lottie state
- Most reliable reset mechanism

## Performance Considerations
- Refs don't trigger re-renders (efficient)
- requestAnimationFrame ensures smooth updates
- Animation duration calculated to match actual playback
- Cleanup prevents memory leaks

## Future Enhancements
- Add animation speed configuration
- Support custom frame mappings
- Add animation completion callbacks
- Implement animation preloading
