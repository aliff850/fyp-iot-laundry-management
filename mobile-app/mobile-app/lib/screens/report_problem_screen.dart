import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/public_models.dart';
import '../services/public_api_service.dart';
import '../theme/spinsense_theme.dart';

enum _ContactChoice { none, email, phone }

class ReportProblemScreen extends StatefulWidget {
  const ReportProblemScreen({
    super.key,
    required this.apiService,
    required this.branchId,
    required this.branchName,
    required this.organizationName,
    required this.machineId,
    required this.machineLabel,
  });

  final PublicApiService apiService;
  final String branchId;
  final String branchName;
  final String organizationName;
  final String machineId;
  final String machineLabel;

  @override
  State<ReportProblemScreen> createState() => _ReportProblemScreenState();
}

class _ReportProblemScreenState extends State<ReportProblemScreen> {
  static const Uuid _uuid = Uuid();
  static final RegExp _emailRegex =
      RegExp(r'^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,24}$');
  static final RegExp _phoneRegex = RegExp(r'^\+?[0-9\s\-()]{7,20}$');

  final _formKey = GlobalKey<FormState>();
  final _descriptionController = TextEditingController();
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();

  late String _requestId;
  ReportCategory _category = ReportCategory.wontStart;
  _ContactChoice _contactChoice = _ContactChoice.none;
  bool _contactConsent = false;
  bool _isSubmitting = false;
  bool _canRetrySameId = false;
  bool _hasIdConflict = false;
  String? _submitError;
  PublicReportReceipt? _receipt;

  @override
  void initState() {
    super.initState();
    _requestId = _uuid.v4();
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _nameController.dispose();
    _contactController.dispose();
    super.dispose();
  }

  String _collapseWhitespace(String input) =>
      input.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).join(' ');

  void _startFreshDraft() {
    setState(() {
      _requestId = _uuid.v4();
      _category = ReportCategory.wontStart;
      _descriptionController.clear();
      _nameController.clear();
      _contactController.clear();
      _contactChoice = _ContactChoice.none;
      _contactConsent = false;
      _canRetrySameId = false;
      _hasIdConflict = false;
      _submitError = null;
      _receipt = null;
    });
  }

  void _resetConflictDraftIdOnly() {
    setState(() {
      _requestId = _uuid.v4();
      _hasIdConflict = false;
      _canRetrySameId = false;
      _submitError = null;
    });
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    setState(() {
      _submitError = null;
      _hasIdConflict = false;
    });

    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid) return;

    if (_contactChoice != _ContactChoice.none && !_contactConsent) {
      setState(() {
        _submitError =
            'Please tick the contact consent box before sharing an email or phone number.';
      });
      return;
    }

    final cleanDesc = _collapseWhitespace(_descriptionController.text);
    final cleanName = _collapseWhitespace(_nameController.text);
    final contactVal = _contactController.text.trim();

    final draft = PublicReportDraft(
      requestId: _requestId,
      category: _category,
      description: cleanDesc,
      reporterName: cleanName.isEmpty ? null : cleanName,
      contactType: _contactChoice == _ContactChoice.none
          ? null
          : (_contactChoice == _ContactChoice.email ? 'email' : 'phone'),
      contactValue: _contactChoice == _ContactChoice.none ? null : contactVal,
      contactConsent: _contactChoice != _ContactChoice.none && _contactConsent,
    );

    setState(() => _isSubmitting = true);

    try {
      final receipt = await widget.apiService.submitMachineReport(
        branchId: widget.branchId,
        machineId: widget.machineId,
        draft: draft,
      );
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _receipt = receipt;
        _canRetrySameId = false;
      });
    } on PublicApiException catch (e) {
      if (!mounted) return;
      String message = e.message;
      if (e.kind == ApiFailureKind.rateLimited && e.retryAfterSeconds != null) {
        message =
            '${e.message} Retry available in ${e.retryAfterSeconds} seconds.';
      }
      setState(() {
        _isSubmitting = false;
        _submitError = message;
        _hasIdConflict = e.kind == ApiFailureKind.conflict;
        _canRetrySameId = e.kind == ApiFailureKind.network ||
            e.kind == ApiFailureKind.server;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Report machine problem'),
      ),
      body: SafeArea(
        child: _receipt != null
            ? _ReceiptView(
                receipt: _receipt!,
                branchName: widget.branchName,
                organizationName: widget.organizationName,
                machineLabel: widget.machineLabel,
                onReportAnother: _startFreshDraft,
                onDone: () => Navigator.of(context).pop(),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _LockedAssetCard(
                        organizationName: widget.organizationName,
                        branchName: widget.branchName,
                        machineLabel: widget.machineLabel,
                      ),
                      const SizedBox(height: 16),
                      if (_submitError != null) ...[
                        _ErrorBanner(
                          message: _submitError!,
                          showNewDraftAction: _hasIdConflict,
                          onNewDraft: _resetConflictDraftIdOnly,
                        ),
                        const SizedBox(height: 16),
                      ],
                      Text(
                        'Issue category',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<ReportCategory>(
                        initialValue: _category,
                        isExpanded: true,
                        dropdownColor: SpinSenseColors.raised,
                        items: ReportCategory.values
                            .map(
                              (cat) => DropdownMenuItem<ReportCategory>(
                                value: cat,
                                child: Text(cat.label),
                              ),
                            )
                            .toList(),
                        onChanged: _isSubmitting
                            ? null
                            : (val) {
                                if (val != null) {
                                  setState(() => _category = val);
                                }
                              },
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'What happened?',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _descriptionController,
                        enabled: !_isSubmitting,
                        maxLines: 4,
                        maxLength: 1000,
                        decoration: const InputDecoration(
                          hintText:
                              'Describe the problem (at least 10 characters)',
                          helperText: 'Required: 10 to 1,000 characters.',
                        ),
                        validator: (val) {
                          final cleaned = _collapseWhitespace(val ?? '');
                          if (cleaned.length < 10) {
                            return 'Enter at least 10 characters describing the issue.';
                          }
                          if (cleaned.length > 1000) {
                            return 'Keep description within 1,000 characters.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Your name (optional)',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _nameController,
                        enabled: !_isSubmitting,
                        maxLength: 100,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          hintText: 'Leave blank to remain unnamed',
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Optional follow-up contact',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Optional. Used only if store owners or managers need manual follow-up.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: SpinSenseColors.muted,
                            ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _ContactChoiceChip(
                            label: 'No contact',
                            selected: _contactChoice == _ContactChoice.none,
                            onTap: _isSubmitting
                                ? null
                                : () => setState(() {
                                      _contactChoice = _ContactChoice.none;
                                      _contactController.clear();
                                      _contactConsent = false;
                                    }),
                          ),
                          _ContactChoiceChip(
                            label: 'Email',
                            selected: _contactChoice == _ContactChoice.email,
                            onTap: _isSubmitting
                                ? null
                                : () => setState(() {
                                      if (_contactChoice !=
                                          _ContactChoice.email) {
                                        _contactController.clear();
                                      }
                                      _contactChoice = _ContactChoice.email;
                                    }),
                          ),
                          _ContactChoiceChip(
                            label: 'Phone',
                            selected: _contactChoice == _ContactChoice.phone,
                            onTap: _isSubmitting
                                ? null
                                : () => setState(() {
                                      if (_contactChoice !=
                                          _ContactChoice.phone) {
                                        _contactController.clear();
                                      }
                                      _contactChoice = _ContactChoice.phone;
                                    }),
                          ),
                        ],
                      ),
                      if (_contactChoice != _ContactChoice.none) ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _contactController,
                          enabled: !_isSubmitting,
                          maxLength: 160,
                          keyboardType: _contactChoice == _ContactChoice.email
                              ? TextInputType.emailAddress
                              : TextInputType.phone,
                          decoration: InputDecoration(
                            labelText: _contactChoice == _ContactChoice.email
                                ? 'Email address'
                                : 'Phone number',
                            hintText: _contactChoice == _ContactChoice.email
                                ? 'customer@example.com'
                                : '+60123456789',
                          ),
                          validator: (val) {
                            final trimmed = (val ?? '').trim();
                            if (trimmed.isEmpty) {
                              return _contactChoice == _ContactChoice.email
                                  ? 'Enter an email address or choose No contact.'
                                  : 'Enter a phone number or choose No contact.';
                            }
                            if (_contactChoice == _ContactChoice.email &&
                                !_emailRegex.hasMatch(trimmed)) {
                              return 'Enter a valid email address.';
                            }
                            if (_contactChoice == _ContactChoice.phone &&
                                !_phoneRegex.hasMatch(trimmed)) {
                              return 'Enter a valid phone number.';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 6),
                        Card(
                          color: SpinSenseColors.raised,
                          child: CheckboxListTile(
                            value: _contactConsent,
                            onChanged: _isSubmitting
                                ? null
                                : (val) => setState(
                                      () => _contactConsent = val ?? false,
                                    ),
                            activeColor: SpinSenseColors.accent,
                            controlAffinity: ListTileControlAffinity.leading,
                            title: const Text(
                              'I agree that store owners or branch managers may use this contact to follow up on my report.',
                              style: TextStyle(fontSize: 13),
                            ),
                            subtitle: const Text(
                              'No customer account or automated notifications will be created.',
                              style: TextStyle(
                                fontSize: 12,
                                color: SpinSenseColors.faint,
                              ),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: _isSubmitting ? null : _submit,
                        child: Text(
                          _isSubmitting
                              ? 'Submitting report...'
                              : (_canRetrySameId
                                  ? 'Retry sending report'
                                  : 'Submit problem report'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _LockedAssetCard extends StatelessWidget {
  const _LockedAssetCard({
    required this.organizationName,
    required this.branchName,
    required this.machineLabel,
  });

  final String organizationName;
  final String branchName;
  final String machineLabel;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: SpinSenseColors.navy,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              machineLabel,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              branchName,
              style: const TextStyle(color: SpinSenseColors.ink, fontSize: 13),
            ),
            const SizedBox(height: 2),
            Text(
              organizationName,
              style: const TextStyle(color: SpinSenseColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            const Text(
              'Use this form for QR payment issues, poor wash/dry results, stuck doors, spills, or refund assistance. Leave optional contact details if you would like store staff to follow up.',
              style: TextStyle(
                color: SpinSenseColors.muted,
                fontSize: 12,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactChoiceChip extends StatelessWidget {
  const _ContactChoiceChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
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

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({
    required this.message,
    required this.showNewDraftAction,
    required this.onNewDraft,
  });

  final String message;
  final bool showNewDraftAction;
  final VoidCallback onNewDraft;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: SpinSenseColors.raised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: SpinSenseColors.negative),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.error_outline_rounded,
                  color: SpinSenseColors.negative,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    message,
                    style: const TextStyle(color: SpinSenseColors.ink, fontSize: 13),
                  ),
                ),
              ],
            ),
            if (showNewDraftAction) ...[
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: onNewDraft,
                child: const Text('Reset submission ID'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReceiptView extends StatelessWidget {
  const _ReceiptView({
    required this.receipt,
    required this.branchName,
    required this.organizationName,
    required this.machineLabel,
    required this.onReportAnother,
    required this.onDone,
  });

  final PublicReportReceipt receipt;
  final String branchName;
  final String organizationName;
  final String machineLabel;
  final VoidCallback onReportAnother;
  final VoidCallback onDone;

  String _formatReceiptTime(DateTime? dt) {
    if (dt == null) return 'Confirmed by server';
    final local = dt.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$y-$m-$d $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline_rounded,
                        color: SpinSenseColors.positive,
                        size: 28,
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Report received',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: SpinSenseColors.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 12),
                  _ReceiptRow(label: 'Reference', value: receipt.referenceCode),
                  const SizedBox(height: 8),
                  _ReceiptRow(
                    label: 'Received at',
                    value: _formatReceiptTime(receipt.receivedAt),
                  ),
                  const SizedBox(height: 8),
                  _ReceiptRow(label: 'Machine', value: machineLabel),
                  const SizedBox(height: 8),
                  _ReceiptRow(label: 'Branch', value: branchName),
                  const SizedBox(height: 8),
                  _ReceiptRow(label: 'Company', value: organizationName),
                  const SizedBox(height: 14),
                  const Text(
                    'Store staff review submitted reports in their maintenance queue. Save the reference number above if you need to quote it.',
                    style: TextStyle(color: SpinSenseColors.muted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          ElevatedButton(
            onPressed: onDone,
            child: const Text('Back to branch'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: onReportAnother,
            child: const Text('Submit another report'),
          ),
        ],
      ),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: SpinSenseColors.faint, fontSize: 13),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: SpinSenseColors.ink,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}
