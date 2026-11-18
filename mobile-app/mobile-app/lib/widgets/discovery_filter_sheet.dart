import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';

@immutable
class DiscoveryFilterState {
  const DiscoveryFilterState({
    this.organizationId,
    this.machineType,
    this.minCapacityKg,
    this.availableOnly = false,
    this.openNowOnly = false,
  });

  final String? organizationId;
  final String? machineType; // 'washer', 'dryer', 'washer_dryer'
  final double? minCapacityKg;
  final bool availableOnly;
  final bool openNowOnly;

  bool get hasActiveFilters =>
      organizationId != null ||
      machineType != null ||
      minCapacityKg != null ||
      availableOnly ||
      openNowOnly;

  int get activeFilterCount {
    var count = 0;
    if (organizationId != null) count += 1;
    if (machineType != null) count += 1;
    if (minCapacityKg != null) count += 1;
    if (availableOnly) count += 1;
    if (openNowOnly) count += 1;
    return count;
  }

  DiscoveryFilterState copyWith({
    String? Function()? organizationId,
    String? Function()? machineType,
    double? Function()? minCapacityKg,
    bool? availableOnly,
    bool? openNowOnly,
  }) {
    return DiscoveryFilterState(
      organizationId: organizationId != null ? organizationId() : this.organizationId,
      machineType: machineType != null ? machineType() : this.machineType,
      minCapacityKg: minCapacityKg != null ? minCapacityKg() : this.minCapacityKg,
      availableOnly: availableOnly ?? this.availableOnly,
      openNowOnly: openNowOnly ?? this.openNowOnly,
    );
  }
}

Future<DiscoveryFilterState?> showDiscoveryFilterSheet({
  required BuildContext context,
  required DiscoveryFilterState initialFilters,
  required List<PublicOrganization> organizations,
}) {
  return showModalBottomSheet<DiscoveryFilterState>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => _DiscoveryFilterSheetBody(
      initialFilters: initialFilters,
      organizations: organizations,
    ),
  );
}

class _DiscoveryFilterSheetBody extends StatefulWidget {
  const _DiscoveryFilterSheetBody({
    required this.initialFilters,
    required this.organizations,
  });

  final DiscoveryFilterState initialFilters;
  final List<PublicOrganization> organizations;

  @override
  State<_DiscoveryFilterSheetBody> createState() => _DiscoveryFilterSheetBodyState();
}

class _DiscoveryFilterSheetBodyState extends State<_DiscoveryFilterSheetBody> {
  late DiscoveryFilterState _draft;

  @override
  void initState() {
    super.initState();
    _draft = widget.initialFilters;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Filter branches',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                TextButton(
                  onPressed: () {
                    setState(() => _draft = const DiscoveryFilterState());
                  },
                  child: const Text('Clear filters'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Company',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _draft.organizationId,
              isExpanded: true,
              dropdownColor: SpinSenseColors.raised,
              decoration: const InputDecoration(
                hintText: 'All companies',
              ),
              items: [
                const DropdownMenuItem<String>(
                  value: null,
                  child: Text('All companies'),
                ),
                ...widget.organizations.map(
                  (org) => DropdownMenuItem<String>(
                    value: org.id,
                    child: Text(org.name, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _draft = _draft.copyWith(organizationId: () => value);
                });
              },
            ),
            const SizedBox(height: 18),
            Text(
              'Machine type',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _FilterOptionChip(
                  label: 'Any type',
                  selected: _draft.machineType == null,
                  onTap: () => setState(() => _draft = _draft.copyWith(machineType: () => null)),
                ),
                _FilterOptionChip(
                  label: 'Washer',
                  selected: _draft.machineType == 'washer',
                  onTap: () =>
                      setState(() => _draft = _draft.copyWith(machineType: () => 'washer')),
                ),
                _FilterOptionChip(
                  label: 'Dryer',
                  selected: _draft.machineType == 'dryer',
                  onTap: () =>
                      setState(() => _draft = _draft.copyWith(machineType: () => 'dryer')),
                ),
                _FilterOptionChip(
                  label: 'Washer/Dryer',
                  selected: _draft.machineType == 'washer_dryer',
                  onTap: () => setState(
                    () => _draft = _draft.copyWith(machineType: () => 'washer_dryer'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              'Minimum load capacity',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <double?>[null, 10, 15, 20].map((cap) {
                return _FilterOptionChip(
                  label: cap == null ? 'Any size' : '${cap.toInt()} kg+',
                  selected: _draft.minCapacityKg == cap,
                  onTap: () => setState(
                    () => _draft = _draft.copyWith(minCapacityKg: () => cap),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Has available machine now'),
              value: _draft.availableOnly,
              activeThumbColor: SpinSenseColors.accent,
              onChanged: (val) => setState(
                () => _draft = _draft.copyWith(availableOnly: val),
              ),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Open now (regular hours)'),
              value: _draft.openNowOnly,
              activeThumbColor: SpinSenseColors.accent,
              onChanged: (val) => setState(
                () => _draft = _draft.copyWith(openNowOnly: val),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(_draft),
                    child: const Text('Apply filters'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterOptionChip extends StatelessWidget {
  const _FilterOptionChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? SpinSenseColors.navySelected : SpinSenseColors.raised,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected ? SpinSenseColors.accent : SpinSenseColors.control,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: SpinSenseColors.ink,
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
