package com.ema.mayoreo;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
  private static final String URL_KEY="url";
  private static final int NAVY=Color.rgb(9,21,39), CYAN=Color.rgb(69,214,249);
  private WebView web;
  private String server="";
  private ValueCallback<Uri[]> pendingFiles;
  private static final int PICK_FILE=108;

  private int dp(int v){ return (int)(v*getResources().getDisplayMetrics().density+0.5f); }
  private TextView txt(String s,int size,int color) {
    TextView t=new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color);
    t.setPadding(dp(3),dp(8),dp(3),dp(8));return t;
  }
  private LinearLayout base(){
    LinearLayout c=new LinearLayout(this);c.setOrientation(1);c.setBackgroundColor(NAVY);return c;
  }
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(NAVY);getWindow().setNavigationBarColor(NAVY);
    String url=getPreferences(0).getString(URL_KEY,"");
    if(url.isEmpty())connectScreen();else openDashboard(url);
  }
  private boolean isSafe(String s) {
    try{
      Uri u=Uri.parse(s);
      return "https".equalsIgnoreCase(u.getScheme()) && u.getHost()!=null && !u.getHost().isEmpty()
       && u.getUserInfo()==null && (u.getPort()==-1 || u.getPort()==443)
       && (u.getPath()==null || u.getPath().isEmpty() || u.getPath().equals("/"))
       && u.getQuery()==null && u.getFragment()==null;
    }catch(Exception e){return false;}
  }
  private void connectScreen(){
    if(web!=null){ web.destroy();web=null; }
    LinearLayout c=base();c.setPadding(dp(22),dp(48),dp(22),dp(18));setContentView(c);
    c.addView(txt("EMA  V65",38,CYAN));
    c.addView(txt("Enterprise Mobile",25,Color.WHITE));
    c.addView(txt("Sistema de inteligencia de ventas y facturación.",16,Color.rgb(187,208,231)));
    c.addView(txt("Conectá la dirección HTTPS privada de tu servidor EMA. La aplicación no contiene los datos ni ejecuta Python en el teléfono.",14,Color.rgb(187,208,231)));
    EditText e=new EditText(this);e.setSingleLine(true);e.setTextColor(Color.WHITE);
    e.setHintTextColor(Color.LTGRAY);e.setHint("https://tu-ema.onrender.com");
    e.setText(getPreferences(0).getString(URL_KEY,""));
    e.setInputType(17);
    c.addView(e,new LinearLayout.LayoutParams(-1,dp(58)));
    Button b=new Button(this);b.setText("CONECTAR A EMA");c.addView(b,new LinearLayout.LayoutParams(-1,dp(58)));
    b.setOnClickListener(v->{
      String s=e.getText().toString().trim();
      while(s.endsWith("/"))s=s.substring(0,s.length()-1);
      if(!isSafe(s)){Toast.makeText(this,"Se requiere URL HTTPS válida",Toast.LENGTH_LONG).show();return;}
      getPreferences(0).edit().putString(URL_KEY,s).apply();openDashboard(s);
    });
    c.addView(txt("Tus operaciones requieren inicio de sesión en el servidor. Nunca publiques tu SQLite sin protección.",12,Color.rgb(147,169,192)));
  }
  private void openDashboard(String url){
    if(!isSafe(url)){connectScreen();return;}
    server=url;LinearLayout c=base();setContentView(c);
    LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(12),0,dp(12),0);
    TextView title=txt("EMA MAYOREO 65",16,Color.WHITE);
    title.setTypeface(null,1);
    bar.addView(title,new LinearLayout.LayoutParams(0,dp(56),1));
    Button reload=new Button(this);reload.setText("↻");reload.setContentDescription("Recargar");
    bar.addView(reload,new LinearLayout.LayoutParams(dp(52),dp(52)));
    Button change=new Button(this);change.setText("URL");change.setContentDescription("Cambiar servidor");
    bar.addView(change,new LinearLayout.LayoutParams(dp(66),dp(52)));
    c.addView(bar,new LinearLayout.LayoutParams(-1,dp(60)));
    web=new WebView(this);c.addView(web,new LinearLayout.LayoutParams(-1,0,1f));
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setJavaScriptCanOpenWindowsAutomatically(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    WebView.setWebContentsDebuggingEnabled(false);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
        Uri u=req.getUrl();Uri host=Uri.parse(server);
        if("https".equalsIgnoreCase(u.getScheme())&&host.getHost().equalsIgnoreCase(u.getHost())&&u.getPort()==host.getPort())return false;
        try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ex){Toast.makeText(MainActivity.this,"No se puede abrir el enlace",Toast.LENGTH_SHORT).show();}
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params){
        if(pendingFiles!=null)pendingFiles.onReceiveValue(null);
        pendingFiles=cb;
        try{
          Intent pick=new Intent(Intent.ACTION_GET_CONTENT);pick.addCategory(Intent.CATEGORY_OPENABLE);
          pick.setType("*/*");startActivityForResult(Intent.createChooser(pick,"Elegir Excel o CSV"),PICK_FILE);
          return true;
        }catch(Exception e){pendingFiles=null;cb.onReceiveValue(null);return false;}
      }
    });
    web.setDownloadListener((target,agent,disposition,mime,len)->{
      try{
        Uri u=Uri.parse(target);Uri host=Uri.parse(server);
        if(!"https".equalsIgnoreCase(u.getScheme())||!host.getHost().equalsIgnoreCase(u.getHost())||u.getPort()!=host.getPort())throw new IllegalArgumentException("Descarga externa");
        DownloadManager.Request request=new DownloadManager.Request(u);
        request.addRequestHeader("Cookie",CookieManager.getInstance().getCookie(target));
        request.addRequestHeader("User-Agent",agent);
        request.setMimeType(mime);
        request.setTitle("EMA - "+URLUtil.guessFileName(target,disposition,mime));
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,URLUtil.guessFileName(target,disposition,mime));
        ((DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
        Toast.makeText(this,"Descarga iniciada",Toast.LENGTH_SHORT).show();
      }catch(Exception e){Toast.makeText(this,"No se pudo descargar el reporte",Toast.LENGTH_LONG).show();}
    });
    reload.setOnClickListener(v->web.reload());
    change.setOnClickListener(v->connectScreen());
    web.loadUrl(server+"/");
  }
  @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
    super.onActivityResult(requestCode,resultCode,data);
    if(requestCode==PICK_FILE&&pendingFiles!=null){
      Uri[] chosen=resultCode==RESULT_OK && data!=null && data.getData()!=null?new Uri[]{data.getData()}:null;
      pendingFiles.onReceiveValue(chosen);pendingFiles=null;
    }
  }
  @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onDestroy(){if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
