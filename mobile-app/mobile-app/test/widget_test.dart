import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('App launches smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const SpinSenseApp());

    // Verify that brand header is present
    expect(find.text('MSU SpinSense'), findsOneWidget);
  });
}
