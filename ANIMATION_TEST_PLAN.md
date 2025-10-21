# Animation System Test Plan

## Test Environment Setup
1. Have at least 2-3 test services in different states (confirmed, helpr_otw, in_progress, completed)
2. Enable console logging in both apps
3. Have both customer and provider apps running

## Critical Test Cases

### 🎯 Test 1: Navigation from Landing (NEW SERVICE)
**Purpose**: Verify animation shows correct frame immediately when opening service from card

**Steps**:
1. Open provider app landing page
2. Note status of a service card (e.g., "Helpr OTW")
3. Tap the service card to open ServiceDetails
4. Observe animation

**Expected Result**:
- ✅ Animation appears at correct frame instantly (no jump)
- ✅ Console shows: `🎬 Animation effect: { isNewService: true, ... }`
- ✅ Console shows: `✨ New service detected, jumping to frame: X`
- ✅ Animation matches service status shown on card

**Common Failure**: Animation starts at frame 0 then jumps to correct frame
**If Failed**: Check that `setTimeout` delay is working and key prop is set

---

### 🔄 Test 2: Status Update (SAME SERVICE)
**Purpose**: Verify smooth animation when service status changes via button

**Steps**:
1. Open a service in "Confirmed" state (frame 0)
2. Tap the status action button (e.g., "On The Way")
3. Observe animation

**Expected Result**:
- ✅ Animation smoothly transitions from frame 0 → 20
- ✅ Console shows: `🎬 Animation effect: { statusChanged: true, ... }`
- ✅ Console shows: `▶️ Status changed, animating from 0 to 20`
- ✅ No jumping or snapping
- ✅ Animation completes at correct frame

**Common Failure**: Animation jumps instead of smooth transition
**If Failed**: Check `animateToFrame` logic and `isAnimatingRef` flag

---

### 🔀 Test 3: Switching Between Services
**Purpose**: Verify each service maintains independent animation state

**Steps**:
1. Open Service A (status: "In Progress" - frame 50)
2. Verify animation is at frame 50
3. Go back to landing
4. Open Service B (status: "Confirmed" - frame 0)
5. Verify animation is at frame 0
6. Go back to landing
7. Open Service A again
8. Verify animation is still at frame 50

**Expected Result**:
- ✅ Service B shows frame 0 (not frame 50 from Service A)
- ✅ Console shows `🧹 Cleaning up animation state` when navigating away
- ✅ Each service displays its own status correctly
- ✅ No state bleeding between services

**Common Failure**: Service B shows Service A's animation state
**If Failed**: Check cleanup effect and `currentServiceIdRef` reset

---

### 📡 Test 4: Real-time Update (SUPABASE)
**Purpose**: Verify animation updates when status changes in database

**Steps**:
1. Open ServiceDetails in provider app (status: "Confirmed")
2. Keep the screen open
3. Use another device/Supabase dashboard to update the service status to "Helpr_OTW"
4. Observe animation (should update within ~2 seconds due to polling)

**Expected Result**:
- ✅ Animation smoothly transitions to new status
- ✅ Console shows real-time update logs
- ✅ Animation doesn't jump or reset
- ✅ Final frame matches new status

**Common Failure**: Animation doesn't update or jumps
**If Failed**: Check Supabase subscription and `fetchServiceData` triggering

---

### 🔁 Test 5: Component Re-render (SAME STATUS)
**Purpose**: Verify animation stays stable during React re-renders

**Steps**:
1. Open ServiceDetails (status: "In Progress" - frame 50)
2. Trigger a re-render by:
   - Opening/closing a modal (e.g., rating modal if service is complete)
   - Rotating device (if mobile)
   - Any action that causes re-render without status change
3. Observe animation

**Expected Result**:
- ✅ Animation stays at frame 50
- ✅ Console shows: `🔄 Same status, ensuring correct frame: 50`
- ✅ No visible jump or reset
- ✅ Animation remains stable

**Common Failure**: Animation resets to frame 0 on re-render
**If Failed**: Check `statusChanged` condition and `setFrameImmediate` logic

---

### 🔄 Test 6: App Restart (PERSISTENCE)
**Purpose**: Verify animation shows correct frame after app restart

**Steps**:
1. Note a service status (e.g., "Helpr OTW")
2. Close app completely (force quit)
3. Reopen app
4. Navigate to that service's ServiceDetails
5. Observe animation

**Expected Result**:
- ✅ Animation loads at correct frame for status
- ✅ No transition animation on initial load
- ✅ Console shows: `✨ New service detected`
- ✅ Matches service status from database

**Common Failure**: Animation shows wrong frame on cold start
**If Failed**: Check that service data is fetched before animation effect runs

---

### ⚡ Test 7: Rapid Status Changes
**Purpose**: Verify system handles multiple quick status updates

**Steps**:
1. Open ServiceDetails (status: "Confirmed" - frame 0)
2. Quickly tap status button to trigger update
3. While animation is playing, manually update status again in database
4. Observe animation

**Expected Result**:
- ✅ Animation handles conflicting updates gracefully
- ✅ `isAnimatingRef` prevents double-animation
- ✅ Final frame matches final status
- ✅ No visual glitches or stuck animations

**Common Failure**: Animation gets stuck or shows wrong frame
**If Failed**: Check `isAnimatingRef` logic and timeout cleanup

---

### 🔙 Test 8: Backward Status Change (EDGE CASE)
**Purpose**: Verify animation handles status regression (shouldn't happen in production)

**Steps**:
1. Open ServiceDetails (status: "In Progress" - frame 50)
2. Manually set status to "Confirmed" in database (frame 0)
3. Wait for real-time update
4. Observe animation

**Expected Result**:
- ✅ Animation jumps to frame 0 (no backward animation)
- ✅ Console may show warning about backward transition
- ✅ Animation settles at correct frame
- ✅ No infinite loop or crashes

**Common Failure**: System tries to animate backwards
**If Failed**: Check `startFrame >= endFrame` condition in `animateToFrame`

---

## Console Log Checklist

For each test, verify you see appropriate console logs:

### On New Service Navigation:
```
🎬 Animation effect: { serviceId: '...', status: '...', isNewService: true, ... }
✨ New service detected, jumping to frame: X
```

### On Status Change:
```
🎬 Animation effect: { serviceId: '...', status: '...', statusChanged: true, ... }
▶️ Status changed, animating from X to Y
```

### On Re-render (Same Status):
```
🎬 Animation effect: { serviceId: '...', status: '...', statusChanged: false, ... }
🔄 Same status, ensuring correct frame: X
```

### On Navigation Away:
```
🧹 Cleaning up animation state
```

## Edge Cases to Watch For

1. **Null/Undefined Status**: Should not crash, should default to frame 0
2. **Invalid Service ID**: Should not render animation
3. **Animation Ref Not Ready**: Should handle gracefully with early return
4. **Concurrent Status Updates**: Should queue properly
5. **Network Delays**: Should show last known frame until update arrives

## Performance Checks

- ✅ No memory leaks when navigating between services
- ✅ Smooth 60fps animation transitions
- ✅ No janky UI during status updates
- ✅ Refs don't cause unnecessary re-renders

## Debugging Tips

### Animation Not Updating:
1. Check console for `🎬 Animation effect` logs
2. Verify `service?.status` and `service?.service_id` are present
3. Check `animationRef.current` is not null
4. Verify Lottie component has correct `key` prop

### Animation Jumping:
1. Check if `isNewService` is incorrectly triggering
2. Verify `currentServiceIdRef` is updating correctly
3. Look for multiple rapid effect executions
4. Check if cleanup effect is running unexpectedly

### Animation Stuck:
1. Check `isAnimatingRef` value
2. Verify timeout is clearing properly
3. Look for errors in console
4. Check if `goToAndStop` is available

## Success Criteria

All tests must pass with:
- ✅ No visual jumps or glitches
- ✅ Correct console logs for each scenario
- ✅ Smooth animations where expected
- ✅ Instant positioning where expected
- ✅ No errors in console
- ✅ Proper cleanup on unmount

## Customer App Testing

Repeat all tests in customer app (`apps/customer-app/app/ServiceDetails.tsx`):
- Should behave identically to provider app
- Same console logs
- Same smooth animations
- Same status → frame mapping

## Sign-off

Once all tests pass:
- [ ] Provider app ServiceDetails tested
- [ ] Customer app ServiceDetails tested
- [ ] All console logs verified
- [ ] No visual glitches observed
- [ ] Performance acceptable
- [ ] Edge cases handled
- [ ] Documentation reviewed

**Tested by**: ________________  
**Date**: ________________  
**Build**: ________________
