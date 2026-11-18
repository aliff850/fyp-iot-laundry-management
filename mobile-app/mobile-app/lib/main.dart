import 'package:flutter/material.dart';
import 'screens/discovery_screen.dart';
import 'theme/spinsense_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SpinSenseApp());
}

class SpinSenseApp extends StatelessWidget {
  const SpinSenseApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SpinSense',
      debugShowCheckedModeBanner: false,
      theme: SpinSenseTheme.darkTheme,
      home: const DiscoveryScreen(),
    );
  }
}
