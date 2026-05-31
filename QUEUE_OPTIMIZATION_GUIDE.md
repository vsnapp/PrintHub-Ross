# Print Queue Optimization System

## Overview

The Print Queue Optimization System intelligently schedules print jobs across your print farm to maximize throughput while considering worker availability and print deadlines.

## Key Concepts

### Work Hours vs Printer Operation

- **Work Hours**: The hours when human workers are present at the print farm to handle print removal and setup (e.g., 8am - 6pm)
- **Printer Operation**: All printers run 24/7 continuously to maximize productivity

This separation allows the system to:
- Schedule long prints (12+ hours) to finish overnight when workers arrive in the morning
- Schedule shorter prints during work hours so workers can immediately remove them and start the next job
- Maximize printer utilization across 24/7 operation

## How to Use

### 1. Configure Worker Hours

1. Navigate to the **Schedule** tab in PrintHub
2. Click **Worker Hours** button in the header
3. Set the hours when workers are present:
   - **Workers Arrive At**: Start of shift (e.g., 8 AM)
   - **Workers Leave At**: End of shift (e.g., 6 PM)
4. Click **Save**

### 2. Add Print Orders

1. Click **Add Order** button
2. Fill in the order details:
   - **Order Name**: Descriptive name for the print job
   - **Total Parts Needed**: How many parts to produce
   - **Parts Per Print**: How many parts are produced in each print job
   - **Print Time per Job**: Estimated time for one print (in minutes)
   - **Deadline**: When the order must be completed
   - (Optional) **Assign to Group/Printer**: Pre-assign to specific equipment

### 3. Optimize the Queue

1. Click **Optimize Queue** button
2. The system will:
   - Analyze all incomplete print jobs
   - Consider print durations, deadlines, and priorities
   - Schedule prints optimally across available printers
   - Maximize overnight printing (minimizing worker intervention)
3. View the optimized schedule in the timeline visualization

### 4. Review the Schedule

The **Optimized Schedule Timeline** shows:

- **Timeline View**: Visual representation of all scheduled prints
- **Color Coding**: 
  - Red: High priority
  - Yellow: Medium priority
  - Green: Low priority
- **Overnight Indicator**: Moon icon for prints running mostly overnight
- **Printer Utilization**: Percentage of each printer's capacity being used

### 5. Handle Unscheduled Jobs

If some jobs cannot be scheduled within their deadlines, you'll see:

- Warning card showing unscheduled prints
- Suggestions:
  - Extend deadlines
  - Reduce parts per order
  - Add more printers
  - Extend worker hours for critical jobs

## Optimization Strategy

The system uses intelligent scoring to find optimal placements:

1. **Priority-Based**: High priority and urgent deadlines get scheduled first
2. **Overnight Optimization**: Long prints (8+ hours) are scheduled to complete when workers arrive
3. **Worker-Hours Efficiency**: Short prints scheduled during work hours for immediate processing
4. **Deadline Compliance**: All scheduled prints meet their deadlines
5. **Utilization Maximization**: Keeps all printers running as much as possible

## Example Scenarios

### Scenario 1: Long Overnight Print

**Job**: 12-hour print, due in 2 days
**Work Hours**: 8am - 6pm
**Optimization Result**: Scheduled 6pm - 6am (completes when workers arrive)

Benefits:
- ✅ Runs entirely overnight (no worker time used)
- ✅ Ready for removal at 6am when workers arrive
- ✅ Printer available for next job during work hours

### Scenario 2: Quick Prints

**Job**: 2-hour print, 5 parts needed
**Work Hours**: 8am - 6pm
**Optimization Result**: Multiple 2-hour slots during work hours

Benefits:
- ✅ Workers can immediately remove and start next print
- ✅ Multiple prints completed in one day
- ✅ No overnight delay waiting for worker arrival

### Scenario 3: Mixed Workload

**Jobs**: 
- 3x 12-hour prints (overnight candidates)
- 8x 2-hour prints (quick turnaround)
- 4x 4-hour prints (medium duration)

**Optimization Result**:
- Long prints scheduled overnight across available printers
- Quick prints fill daytime slots
- Medium prints scheduled for optimal worker availability
- All deadlines met with maximum printer utilization

## Tips for Best Results

1. **Accurate Time Estimates**: Provide realistic print time estimates for better scheduling
2. **Reasonable Deadlines**: Set achievable deadlines considering print farm capacity
3. **Priority Levels**: Use high priority for truly urgent jobs
4. **Worker Hours**: Configure accurate work hours for optimal overnight scheduling
5. **Regular Optimization**: Re-run optimization when new orders are added or priorities change

## Printer-Specific Times

For jobs that print at different speeds on different printers:

1. Click **Edit Times** on any order card
2. Set printer-specific print times
3. Leave blank to use the default time
4. The optimizer will use these specific times when scheduling

## Monitoring Utilization

The **Printer Utilization** section shows:
- Percentage of scheduling window used per printer
- Green (>90%): Excellent utilization
- Yellow (70-90%): Good utilization
- Orange (50-70%): Moderate utilization  
- Red (<50%): Low utilization

Low utilization may indicate:
- Not enough jobs in queue
- Deadlines too far in future
- Printers not being fully leveraged
